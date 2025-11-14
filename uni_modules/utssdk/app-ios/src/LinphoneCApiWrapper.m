#import "LinphoneCApiWrapper.h"

#import <LinlinCore/LinlinCore.h>
#import <LinlinCore/api/c-account.h>
#import <LinlinCore/api/c-account-cbs.h>
#import <LinlinCore/api/c-account-params.h>
#import <LinlinCore/api/c-call.h>
#import <LinlinCore/api/c-chat-message.h>
#import <LinlinCore/api/c-chat-room.h>
#import <LinlinCore/api/c-factory.h>
#import <LinlinCore/api/c-callbacks.h>
#import <LinlinCore/api/c-audio-device.h>
#import <LinlinCore/misc.h>
#import <LinlinBCToolbox/list.h>
#import <LinlinMediastreamer2/mscommon.h>

#import <string.h>

static NSString *const LinphoneWrapperErrorDomain = @"com.utssdk.linphone.wrapper";
static NSString *const kRegistrationStateKey = @"registrationState";
static NSString *const kCallStateKey = @"callState";
static NSString *const kAudioRouteKey = @"audioRoute";
static NSString *const kConfigurationKey = @"configuration";

static const NSTimeInterval kLinphoneCoreIterateInterval = 0.05;
static const void *kLinphoneWrapperQueueKey = &kLinphoneWrapperQueueKey;

typedef NS_ENUM(NSInteger, LinphoneWrapperErrorCode) {
    LinphoneWrapperErrorCodeInvalidArguments = 1,
    LinphoneWrapperErrorCodeNotInitialized = 2,
    LinphoneWrapperErrorCodeOperationFailed = 3
};

static NSString *UTSStringFromCString(const char *cString) {
    if (!cString) {
        return nil;
    }
    NSString *string = [NSString stringWithCString:cString encoding:NSUTF8StringEncoding];
    if (!string) {
        string = [NSString stringWithCString:cString encoding:NSASCIIStringEncoding];
    }
    return string ?: @"";
}

static NSString *RegistrationStateString(LinphoneRegistrationState state) {
    const char *raw = linphone_registration_state_to_string(state);
    NSString *value = UTSStringFromCString(raw);
    return value.length > 0 ? value.lowercaseString : @"unknown";
}

static NSString *CallStateString(LinphoneCallState state) {
    const char *raw = linphone_call_state_to_string(state);
    NSString *value = UTSStringFromCString(raw);
    return value.length > 0 ? value.lowercaseString : @"unknown";
}

static NSString *ReasonString(LinphoneReason reason) {
    const char *raw = linphone_reason_to_string(reason);
    NSString *value = UTSStringFromCString(raw);
    return value.length > 0 ? value.lowercaseString : @"none";
}

static LinphoneTransportType TransportTypeFromString(NSString *transport) {
    if (transport.length == 0) {
        return LinphoneTransportUdp;
    }
    NSString *lower = transport.lowercaseString;
    if ([lower isEqualToString:@"tcp"]) {
        return LinphoneTransportTcp;
    }
    if ([lower isEqualToString:@"tls"]) {
        return LinphoneTransportTls;
    }
    if ([lower isEqualToString:@"dtls"]) {
        return LinphoneTransportDtls;
    }
    return LinphoneTransportUdp;
}

static NSString *NormalizedRouteString(NSString *route) {
    if (route.length == 0) {
        return @"system";
    }
    NSString *lower = route.lowercaseString;
    if ([lower hasPrefix:@"bluetooth"]) {
        return @"bluetooth";
    }
    if ([lower isEqualToString:@"speaker"] || [lower isEqualToString:@"speakerphone"]) {
        return @"speaker";
    }
    if ([lower isEqualToString:@"earpiece"] || [lower isEqualToString:@"receiver"]) {
        return @"earpiece";
    }
    return @"system";
}

static void LinphoneWrapperRegistrationStateChanged(LinphoneAccount *account,
                                                    LinphoneRegistrationState state,
                                                    const char *message);
static void LinphoneWrapperCallStateChanged(LinphoneCore *core,
                                            LinphoneCall *call,
                                            LinphoneCallState state,
                                            const char *message);
static void LinphoneWrapperMessageReceived(LinphoneCore *core,
                                           LinphoneChatRoom *chatRoom,
                                           LinphoneChatMessage *message);
static void LinphoneWrapperAudioDeviceChanged(LinphoneCore *core,
                                              LinphoneAudioDevice *device);
static void LinphoneWrapperAudioDevicesUpdated(LinphoneCore *core);
static void LinphoneWrapperNetworkReachable(LinphoneCore *core, bool_t reachable);
static void LinphoneWrapperMessageStateChanged(LinphoneChatMessage *message,
                                               LinphoneChatMessageState state);

@interface LinphoneCApiWrapper ()

@property (nonatomic, strong) dispatch_queue_t isolationQueue;
@property (nonatomic, strong) NSMutableDictionary<NSString *, id> *stateStorage;
@property (nonatomic, copy, nullable) NSDictionary<NSString *, id> *runtimeConfiguration;
@property (nonatomic, assign) LinphoneFactory *factory;
@property (nonatomic, assign) LinphoneCore *core;
@property (nonatomic, assign) LinphoneCoreCbs *coreCallbacks;
@property (nonatomic, assign) LinphoneAccount *account;
@property (nonatomic, assign) LinphoneAccountCbs *accountCallbacks;
@property (nonatomic, assign) LinphoneCall *currentCall;
@property (nonatomic, strong, nullable) dispatch_source_t iterateTimer;
@property (nonatomic, strong) NSMapTable<NSValue *, NSValue *> *messageCallbackStorage;
@property (nonatomic, copy) NSString *lastConnectivityStatus;

@end

@implementation LinphoneCApiWrapper

+ (instancetype)shared {
    static LinphoneCApiWrapper *sharedInstance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        sharedInstance = [[self alloc] initPrivate];
    });
    return sharedInstance;
}

- (instancetype)initPrivate {
    self = [super init];
    if (self) {
        _isolationQueue = dispatch_queue_create("com.utssdk.linphone.wrapper.core", DISPATCH_QUEUE_SERIAL);
        dispatch_queue_set_specific(_isolationQueue, kLinphoneWrapperQueueKey, (__bridge void *)self, NULL);
        _stateStorage = [[NSMutableDictionary alloc] initWithDictionary:@{
            kRegistrationStateKey: @"none",
            kCallStateKey: @"none",
            kAudioRouteKey: @"system"
        }];
        _messageCallbackStorage = [NSMapTable mapTableWithKeyOptions:(NSPointerFunctionsOpaqueMemory | NSPointerFunctionsOpaquePersonality)
                                                                 valueOptions:(NSPointerFunctionsOpaqueMemory | NSPointerFunctionsOpaquePersonality)];
        _lastConnectivityStatus = @"unknown";
    }
    return self;
}

- (void)dealloc {
    if (self.isolationQueue) {
        dispatch_sync(self.isolationQueue, ^{
            [self tearDownLocked];
        });
    }
}

- (BOOL)initWithConfig:(NSDictionary<NSString *,id> *)config error:(NSError * _Nullable * _Nullable)error {
    __block BOOL success = NO;
    __block NSError *localError = nil;

    dispatch_sync(self.isolationQueue, ^{
        NSDictionary *normalized = [self normalizedConfigurationFromConfig:config error:&localError];
        if (!normalized) {
            return;
        }

        [self tearDownLocked];
        self.runtimeConfiguration = normalized;

        success = [self setupCoreLocked:&localError];
        if (success) {
            self.stateStorage[kConfigurationKey] = normalized;
            self.stateStorage[kRegistrationStateKey] = @"none";
            self.stateStorage[kCallStateKey] = @"none";
            self.stateStorage[kAudioRouteKey] = @"system";
        }
    });

    if (!success && error) {
        *error = localError;
    }

    if (success) {
        [self emitRegistrationState:@"none" detail:nil];
        [self emitAudioRoute:@"system"];
        dispatch_async(self.isolationQueue, ^{
            [self emitAudioDevicesSnapshotLocked];
            [self refreshConnectivitySnapshotLocked];
        });
    }

    return success;
}

- (void)registerWithCompletion:(void (^)(NSError * _Nullable))completion {
    dispatch_async(self.isolationQueue, ^{
        NSError *localError = nil;
        if (![self ensureCoreReadyLocked:&localError]) {
            [self invokeCompletion:completion error:localError];
            return;
        }
        if (![self ensureAccountLocked:&localError]) {
            [self invokeCompletion:completion error:localError];
            return;
        }

        self.stateStorage[kRegistrationStateKey] = @"progress";
        [self emitRegistrationState:@"progress" detail:nil];

        linphone_account_refresh_register(self.account);
        [self invokeCompletion:completion error:nil];
    });
}

- (void)unregisterWithCompletion:(void (^)(NSError * _Nullable))completion {
    dispatch_async(self.isolationQueue, ^{
        if (!self.account) {
            [self invokeCompletion:completion error:nil];
            return;
        }

        const LinphoneAccountParams *currentParams = linphone_account_get_params(self.account);
        LinphoneAccountParams *mutableParams = linphone_account_params_clone(currentParams);
        linphone_account_params_enable_register(mutableParams, FALSE);
        LinphoneStatus status = linphone_account_set_params(self.account, mutableParams);
        linphone_account_params_unref(mutableParams);

        if (status != 0) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeOperationFailed
                                      description:@"Failed to request unregistration."];
            [self invokeCompletion:completion error:error];
            return;
        }

        self.stateStorage[kRegistrationStateKey] = @"progress";
        [self emitRegistrationState:@"progress" detail:nil];
        [self invokeCompletion:completion error:nil];
    });
}

- (void)callDial:(NSString *)number completion:(void (^)(NSError * _Nullable))completion {
    dispatch_async(self.isolationQueue, ^{
        NSError *localError = nil;
        if (![self ensureCoreReadyLocked:&localError] || ![self ensureAccountLocked:&localError]) {
            [self invokeCompletion:completion error:localError];
            return;
        }

        NSString *destination = [self canonicalSipURIForTarget:number];
        if (destination.length == 0) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                                      description:@"Dialed number must not be empty."];
            [self invokeCompletion:completion error:error];
            return;
        }

        LinphoneAddress *address = linphone_factory_create_address(self.factory, destination.UTF8String);
        if (!address) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                                      description:@"Unable to build SIP address for destination."];
            [self invokeCompletion:completion error:error];
            return;
        }

        LinphoneCall *call = linphone_core_invite_address(self.core, address);
        linphone_address_unref(address);

        if (!call) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeOperationFailed
                                      description:@"Failed to start outgoing call."];
            [self invokeCompletion:completion error:error];
            return;
        }

        [self replaceCurrentCallLocked:call];
        linphone_call_unref(call);
        [self invokeCompletion:completion error:nil];
    });
}

- (void)callHangup:(void (^)(NSError * _Nullable))completion {
    dispatch_async(self.isolationQueue, ^{
        if (!self.core) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeNotInitialized
                                      description:@"Linphone core is not initialized."];
            [self invokeCompletion:completion error:error];
            return;
        }

        if (self.currentCall) {
            linphone_call_terminate(self.currentCall);
        } else {
            linphone_core_terminate_all_calls(self.core);
        }
        [self invokeCompletion:completion error:nil];
    });
}

- (void)callAnswer:(void (^)(NSError * _Nullable))completion {
    dispatch_async(self.isolationQueue, ^{
        if (!self.currentCall) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                                      description:@"No active call available to answer."];
            [self invokeCompletion:completion error:error];
            return;
        }

        LinphoneStatus status = linphone_call_accept(self.currentCall);
        if (status != 0) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeOperationFailed
                                      description:@"Failed to answer the call."];
            [self invokeCompletion:completion error:error];
            return;
        }
        [self invokeCompletion:completion error:nil];
    });
}

- (void)sendDtmf:(NSString *)tone completion:(void (^)(NSError * _Nullable))completion {
    dispatch_async(self.isolationQueue, ^{
        if (!self.currentCall) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                                      description:@"No active call to send DTMF."];
            [self invokeCompletion:completion error:error];
            return;
        }
        NSString *trimmed = [tone stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        if (trimmed.length == 0) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                                      description:@"DTMF tone must not be empty."];
            [self invokeCompletion:completion error:error];
            return;
        }

        char digit = (char)[trimmed characterAtIndex:0];
        LinphoneStatus status = linphone_call_send_dtmf(self.currentCall, digit);
        if (status != 0) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeOperationFailed
                                      description:@"Failed to send DTMF tone."];
            [self invokeCompletion:completion error:error];
            return;
        }
        [self invokeCompletion:completion error:nil];
    });
}

- (void)messageSendTo:(NSString *)recipient
                  body:(NSString *)body
             completion:(void (^)(NSError * _Nullable))completion {
    dispatch_async(self.isolationQueue, ^{
        NSError *localError = nil;
        if (![self ensureCoreReadyLocked:&localError] || ![self ensureAccountLocked:&localError]) {
            [self invokeCompletion:completion error:localError];
            return;
        }

        NSString *target = [self canonicalSipURIForTarget:recipient];
        if (target.length == 0 || body.length == 0) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                                      description:@"Recipient and body must not be empty."];
            [self invokeCompletion:completion error:error];
            return;
        }

        LinphoneChatRoom *chatRoom = linphone_core_get_chat_room_from_uri(self.core, target.UTF8String);
        if (!chatRoom) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeOperationFailed
                                      description:@"Unable to lookup chat room for recipient."];
            [self invokeCompletion:completion error:error];
            return;
        }

        LinphoneChatMessage *message = linphone_chat_room_create_message_from_utf8(chatRoom, body.UTF8String);
        if (!message) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeOperationFailed
                                      description:@"Failed to build chat message."];
            [self invokeCompletion:completion error:error];
            return;
        }

        LinphoneChatMessageCbs *callbacks = linphone_chat_message_cbs_new();
        if (callbacks) {
            linphone_chat_message_cbs_set_msg_state_changed(callbacks, LinphoneWrapperMessageStateChanged);
            linphone_chat_message_add_callbacks(message, callbacks);
            [self registerMessageTrackingLocked:message withCallbacks:callbacks];
            linphone_chat_message_cbs_unref(callbacks);
        }

        linphone_chat_message_send(message);
        linphone_chat_message_unref(message);

        if (!callbacks) {
            NSDictionary *fallbackPayload = @{ @"to": target,
                                               @"text": body ?: @"" };
            [self emitMessageEvent:@"sent" payload:fallbackPayload];
        }
        [self invokeCompletion:completion error:nil];
    });
}

- (void)setAudioRoute:(NSString *)route completion:(void (^)(NSError * _Nullable))completion {
    dispatch_async(self.isolationQueue, ^{
        if (!self.core) {
            NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeNotInitialized
                                      description:@"Linphone core is not initialized."];
            [self invokeCompletion:completion error:error];
            return;
        }

        NSString *normalized = NormalizedRouteString(route);
        bctbx_list_t *devices = linphone_core_get_audio_devices(self.core);
        LinphoneAudioDevice *selected = NULL;
        for (bctbx_list_t *cursor = devices; cursor != NULL; cursor = cursor->next) {
            LinphoneAudioDevice *device = (LinphoneAudioDevice *)cursor->data;
            NSString *deviceRoute = [self routeStringForAudioDevice:device];
            if ([deviceRoute isEqualToString:normalized]) {
                selected = device;
                break;
            }
        }

        if (!selected && devices) {
            selected = (LinphoneAudioDevice *)devices->data;
            normalized = [self routeStringForAudioDevice:selected];
        }

        if (selected) {
            linphone_core_set_output_audio_device(self.core, selected);
            linphone_core_set_input_audio_device(self.core, selected);
            linphone_core_set_default_output_audio_device(self.core, selected);
            self.stateStorage[kAudioRouteKey] = normalized;
            [self emitAudioRoute:normalized];
            [self emitAudioDevicesSnapshotLocked];
            if (devices) {
                bctbx_list_free(devices);
            }
            [self invokeCompletion:completion error:nil];
            return;
        }

        if (devices) {
            bctbx_list_free(devices);
        }

        NSError *error = [self errorWithCode:LinphoneWrapperErrorCodeOperationFailed
                                  description:@"Requested audio route is not available."];
        [self invokeCompletion:completion error:error];
    });
}

- (void)dispose {
    dispatch_sync(self.isolationQueue, ^{
        [self resetMessageTrackingLocked];
        [self tearDownLocked];
        self.runtimeConfiguration = nil;
        [self.stateStorage removeAllObjects];
        self.stateStorage[kRegistrationStateKey] = @"none";
        self.stateStorage[kCallStateKey] = @"none";
        self.stateStorage[kAudioRouteKey] = @"system";
        self.lastConnectivityStatus = @"unknown";
    });
}

- (NSDictionary<NSString *,id> *)getState {
    __block NSDictionary<NSString *, id> *snapshot = nil;
    dispatch_sync(self.isolationQueue, ^{
        snapshot = [self.stateStorage copy];
    });
    return snapshot ?: @{};
}

#pragma mark - Internal helpers

- (BOOL)setupCoreLocked:(NSError * _Nullable __autoreleasing *)error {
    self.factory = linphone_factory_get();

    NSString *configPath = [self configurationFilePath];
    LinphoneCore *createdCore = linphone_factory_create_core_3(self.factory, configPath.UTF8String, NULL, NULL);
    if (!createdCore) {
        if (error) {
            *error = [self errorWithCode:LinphoneWrapperErrorCodeOperationFailed
                               description:@"Failed to create Linphone core."];
        }
        return NO;
    }

    self.core = createdCore;
    linphone_core_set_user_data(self.core, (__bridge void *)self);

    self.coreCallbacks = linphone_factory_create_core_cbs(self.factory);
    linphone_core_cbs_set_call_state_changed(self.coreCallbacks, LinphoneWrapperCallStateChanged);
    linphone_core_cbs_set_message_received(self.coreCallbacks, LinphoneWrapperMessageReceived);
    linphone_core_cbs_set_audio_device_changed(self.coreCallbacks, LinphoneWrapperAudioDeviceChanged);
    linphone_core_cbs_set_audio_devices_list_updated(self.coreCallbacks, LinphoneWrapperAudioDevicesUpdated);
    linphone_core_cbs_set_network_reachable(self.coreCallbacks, LinphoneWrapperNetworkReachable);

    linphone_core_add_callbacks(self.core, self.coreCallbacks);

    linphone_core_enable_auto_iterate(self.core, FALSE);
    [self startIterateTimerLocked];

    LinphoneStatus status = linphone_core_start(self.core);
    if (status != 0) {
        if (error) {
            *error = [self errorWithCode:LinphoneWrapperErrorCodeOperationFailed
                               description:@"Failed to start Linphone core."];
        }
        [self tearDownLocked];
        return NO;
    }

    return YES;
}

- (void)startIterateTimerLocked {
    if (self.iterateTimer) {
        dispatch_source_cancel(self.iterateTimer);
        self.iterateTimer = nil;
    }

    dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, self.isolationQueue);
    if (!timer) {
        return;
    }

    dispatch_source_set_timer(timer,
                              dispatch_time(DISPATCH_TIME_NOW, 0),
                              (uint64_t)(kLinphoneCoreIterateInterval * NSEC_PER_SEC),
                              (uint64_t)(0.01 * NSEC_PER_SEC));

    __weak typeof(self) weakSelf = self;
    dispatch_source_set_event_handler(timer, ^{
        __strong typeof(weakSelf) strongSelf = weakSelf;
        if (!strongSelf || !strongSelf.core) {
            return;
        }
        linphone_core_iterate(strongSelf.core);
    });

    dispatch_resume(timer);
    self.iterateTimer = timer;
}

- (void)tearDownLocked {
    [self resetMessageTrackingLocked];

    if (self.iterateTimer) {
        dispatch_source_cancel(self.iterateTimer);
        self.iterateTimer = nil;
    }

    if (self.currentCall) {
        linphone_call_unref(self.currentCall);
        self.currentCall = NULL;
    }

    if (self.accountCallbacks && self.account) {
        linphone_account_remove_callbacks(self.account, self.accountCallbacks);
        linphone_account_cbs_unref(self.accountCallbacks);
        self.accountCallbacks = NULL;
    }

    if (self.account) {
        linphone_account_unref(self.account);
        self.account = NULL;
    }

    if (self.coreCallbacks && self.core) {
        linphone_core_remove_callbacks(self.core, self.coreCallbacks);
        linphone_core_cbs_unref(self.coreCallbacks);
        self.coreCallbacks = NULL;
    }

    if (self.core) {
        linphone_core_stop(self.core);
        linphone_core_set_user_data(self.core, NULL);
        linphone_core_unref(self.core);
        self.core = NULL;
    }
}

#pragma mark - Message tracking

- (void)registerMessageTrackingLocked:(LinphoneChatMessage *)message
                        withCallbacks:(LinphoneChatMessageCbs *)callbacks {
    if (!message || !callbacks) {
        return;
    }

    linphone_chat_message_ref(message);
    linphone_chat_message_cbs_ref(callbacks);

    NSValue *key = [NSValue valueWithPointer:message];
    NSValue *value = [NSValue valueWithPointer:callbacks];
    [self.messageCallbackStorage setObject:value forKey:key];
}

- (void)unregisterMessageTrackingLocked:(LinphoneChatMessage *)message {
    if (!message) {
        return;
    }

    NSValue *key = [NSValue valueWithPointer:message];
    NSValue *stored = [self.messageCallbackStorage objectForKey:key];
    if (stored) {
        LinphoneChatMessageCbs *callbacks = (LinphoneChatMessageCbs *)stored.pointerValue;
        if (callbacks) {
            linphone_chat_message_remove_callbacks(message, callbacks);
            linphone_chat_message_cbs_unref(callbacks);
        }
        [self.messageCallbackStorage removeObjectForKey:key];
    }

    linphone_chat_message_unref(message);
}

- (void)resetMessageTrackingLocked {
    NSEnumerator<NSValue *> *keyEnumerator = self.messageCallbackStorage.keyEnumerator;
    NSValue *key = nil;
    while ((key = keyEnumerator.nextObject)) {
        LinphoneChatMessage *message = (LinphoneChatMessage *)key.pointerValue;
        NSValue *stored = [self.messageCallbackStorage objectForKey:key];
        LinphoneChatMessageCbs *callbacks = (LinphoneChatMessageCbs *)stored.pointerValue;
        if (message && callbacks) {
            linphone_chat_message_remove_callbacks(message, callbacks);
            linphone_chat_message_cbs_unref(callbacks);
        }
        if (message) {
            linphone_chat_message_unref(message);
        }
    }
    [self.messageCallbackStorage removeAllObjects];
}

- (BOOL)ensureCoreReadyLocked:(NSError * _Nullable __autoreleasing *)error {
    if (!self.core) {
        if (error) {
            *error = [self errorWithCode:LinphoneWrapperErrorCodeNotInitialized
                               description:@"Linphone core has not been initialized."];
        }
        return NO;
    }
    return YES;
}

- (BOOL)ensureAccountLocked:(NSError * _Nullable __autoreleasing *)error {
    if (self.account) {
        return YES;
    }

    NSString *username = self.runtimeConfiguration[@"username"];
    NSString *password = self.runtimeConfiguration[@"password"];
    NSString *domain = self.runtimeConfiguration[@"domain"];
    NSString *displayName = self.runtimeConfiguration[@"displayName"];
    NSString *authUser = self.runtimeConfiguration[@"authUser"] ?: username;
    NSString *realm = self.runtimeConfiguration[@"realm"];
    NSString *transport = self.runtimeConfiguration[@"transport"];
    NSNumber *port = self.runtimeConfiguration[@"port"];

    if (!username || !password || !domain) {
        if (error) {
            *error = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                               description:@"Configuration is missing required SIP credentials."];
        }
        return NO;
    }

    NSMutableString *identityURI = [NSMutableString stringWithFormat:@"sip:%@@%@", username, domain];
    if (port) {
        [identityURI appendFormat:@":%d", port.intValue];
    }
    LinphoneAddress *identityAddress = linphone_factory_create_address(self.factory, identityURI.UTF8String);
    if (!identityAddress) {
        if (error) {
            *error = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                               description:@"Unable to create SIP identity address."];
        }
        return NO;
    }

    if (displayName.length > 0) {
        linphone_address_set_display_name(identityAddress, displayName.UTF8String);
    }

    NSMutableString *serverURI = [NSMutableString stringWithFormat:@"sip:%@", domain];
    if (port) {
        [serverURI appendFormat:@":%d", port.intValue];
    }
    LinphoneAddress *serverAddress = linphone_factory_create_address(self.factory, serverURI.UTF8String);
    if (!serverAddress) {
        linphone_address_unref(identityAddress);
        if (error) {
            *error = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                               description:@"Unable to create proxy server address."];
        }
        return NO;
    }

    if (port) {
        linphone_address_set_port(serverAddress, port.intValue);
    }
    if (transport.length > 0) {
        linphone_address_set_transport(serverAddress, TransportTypeFromString(transport));
    }

    LinphoneAccountParams *params = linphone_core_create_account_params(self.core);
    linphone_account_params_set_identity_address(params, identityAddress);
    linphone_account_params_set_server_address(params, serverAddress);
    linphone_account_params_enable_register(params, TRUE);

    linphone_address_unref(identityAddress);
    linphone_address_unref(serverAddress);

    LinphoneAccount *createdAccount = linphone_core_create_account(self.core, params);
    linphone_account_params_unref(params);

    if (!createdAccount) {
        if (error) {
            *error = [self errorWithCode:LinphoneWrapperErrorCodeOperationFailed
                               description:@"Failed to create Linphone account."];
        }
        return NO;
    }

    LinphoneAuthInfo *auth = linphone_factory_create_auth_info(self.factory,
                                                               username.UTF8String,
                                                               authUser.UTF8String,
                                                               password.UTF8String,
                                                               NULL,
                                                               realm.length > 0 ? realm.UTF8String : NULL,
                                                               domain.UTF8String);
    if (auth) {
        linphone_core_add_auth_info(self.core, auth);
        linphone_auth_info_unref(auth);
    }

    linphone_account_set_user_data(createdAccount, (__bridge void *)self);

    self.accountCallbacks = linphone_factory_create_account_cbs(self.factory);
    linphone_account_cbs_set_registration_state_changed(self.accountCallbacks, LinphoneWrapperRegistrationStateChanged);
    linphone_account_add_callbacks(createdAccount, self.accountCallbacks);

    linphone_core_add_account(self.core, createdAccount);
    linphone_core_set_default_account(self.core, createdAccount);

    self.account = linphone_account_ref(createdAccount);
    linphone_account_unref(createdAccount);

    return YES;
}

- (NSDictionary<NSString *, id> *)normalizedConfigurationFromConfig:(NSDictionary *)config
                                                              error:(NSError * _Nullable __autoreleasing *)error {
    if (![config isKindOfClass:[NSDictionary class]]) {
        if (error) {
            *error = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                               description:@"Configuration must be a dictionary." ];
        }
        return nil;
    }

    NSString *username = [self stringValueForKeys:@[@"username", @"user", @"userName"] inDictionary:config];
    NSString *password = [self stringValueForKeys:@[@"password", @"pass", @"pwd"] inDictionary:config];
    NSString *domain = [self stringValueForKeys:@[@"domain", @"sipServer", @"server", @"host"] inDictionary:config];

    if (username.length == 0 || password.length == 0 || domain.length == 0) {
        if (error) {
            *error = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                               description:@"Configuration must include username, password, and sipServer/domain."];
        }
        return nil;
    }

    NSMutableDictionary *normalized = [NSMutableDictionary dictionary];
    normalized[@"username"] = username;
    normalized[@"password"] = password;
    normalized[@"domain"] = domain;

    NSString *displayName = [self stringValueForKeys:@[@"displayName", @"name"] inDictionary:config];
    if (displayName.length > 0) {
        normalized[@"displayName"] = displayName;
    }

    NSString *authUser = [self stringValueForKeys:@[@"authUser", @"authId", @"authorizationUsername"] inDictionary:config];
    if (authUser.length > 0) {
        normalized[@"authUser"] = authUser;
    }

    NSString *realm = [self stringValueForKeys:@[@"realm"] inDictionary:config];
    if (realm.length > 0) {
        normalized[@"realm"] = realm;
    }

    NSString *transport = [self stringValueForKeys:@[@"transport"] inDictionary:config];
    if (transport.length > 0) {
        normalized[@"transport"] = transport.lowercaseString;
    }

    NSNumber *port = [self numberValueForKeys:@[@"port", @"sipPort"] inDictionary:config];
    if (port) {
        normalized[@"port"] = port;
    }

    return [normalized copy];
}

- (NSString *)configurationFilePath {
    NSArray<NSString *> *paths = NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES);
    NSString *basePath = paths.firstObject ?: NSTemporaryDirectory();
    NSString *directory = [basePath stringByAppendingPathComponent:@"utssdk-linphone"];

    [[NSFileManager defaultManager] createDirectoryAtPath:directory
                              withIntermediateDirectories:YES
                                               attributes:nil
                                                    error:nil];

    return [directory stringByAppendingPathComponent:@"linphonerc"];
}

- (NSString *)canonicalSipURIForTarget:(NSString *)target {
    if (target.length == 0) {
        return @"";
    }
    NSString *trimmed = [target stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (trimmed.length == 0) {
        return @"";
    }

    if ([trimmed hasPrefix:@"sip:"]) {
        return trimmed;
    }
    if ([trimmed containsString:@"@"]) {
        return [@"sip:" stringByAppendingString:trimmed];
    }

    NSString *domain = self.runtimeConfiguration[@"domain"] ?: @"";
    NSNumber *port = self.runtimeConfiguration[@"port"];
    NSMutableString *uri = [NSMutableString stringWithFormat:@"sip:%@@%@", trimmed, domain];
    if (port) {
        [uri appendFormat:@":%d", port.intValue];
    }
    return uri;
}

- (NSString *)stringFromAddress:(const LinphoneAddress *)address {
    if (!address) {
        return @"";
    }
    char *uri = linphone_address_as_string_uri_only(address);
    if (!uri) {
        return @"";
    }
    NSString *result = [[NSString alloc] initWithUTF8String:uri] ?: @"";
    ms_free(uri);
    return result;
}

- (NSString *)routeStringForAudioDevice:(LinphoneAudioDevice *)device {
    if (!device) {
        return @"system";
    }
    LinphoneAudioDeviceType type = linphone_audio_device_get_type(device);
    switch (type) {
        case LinphoneAudioDeviceTypeSpeaker:
        case LinphoneAudioDeviceTypeHeadset:
        case LinphoneAudioDeviceTypeHeadphones:
            return @"speaker";
        case LinphoneAudioDeviceTypeBluetooth:
        case LinphoneAudioDeviceTypeBluetoothA2DP:
            return @"bluetooth";
        case LinphoneAudioDeviceTypeEarpiece:
        case LinphoneAudioDeviceTypeTelephony:
            return @"earpiece";
        default:
            return @"system";
    }
}

- (NSDictionary<NSString *, id> *)dictionaryForAudioDevice:(LinphoneAudioDevice *)device
                                              activeDevice:(LinphoneAudioDevice *)activeDevice
                                             defaultDevice:(LinphoneAudioDevice *)defaultDevice {
    if (!device) {
        return nil;
    }

    NSString *identifier = UTSStringFromCString(linphone_audio_device_get_id(device)) ?: @"";
    NSString *label = UTSStringFromCString(linphone_audio_device_get_device_name(device));
    NSString *type = [self routeStringForAudioDevice:device] ?: @"system";

    NSMutableDictionary<NSString *, id> *descriptor = [NSMutableDictionary dictionary];
    if (identifier.length > 0) {
        descriptor[@"id"] = identifier;
    }
    descriptor[@"label"] = label.length > 0 ? label : (identifier.length > 0 ? identifier : @"unknown");
    descriptor[@"type"] = type;
    descriptor[@"isDefault"] = @((defaultDevice && device == defaultDevice));
    descriptor[@"isConnected"] = @YES;

    if (linphone_audio_device_get_follows_system_routing_policy(device)) {
        descriptor[@"followsSystemRouting"] = @YES;
    }

    LinphoneAudioDeviceCapabilities capabilities = linphone_audio_device_get_capabilities(device);
    NSMutableArray<NSString *> *capabilityList = [NSMutableArray array];
    if (capabilities & LinphoneAudioDeviceCapabilityRecord) {
        [capabilityList addObject:@"record"];
    }
    if (capabilities & LinphoneAudioDeviceCapabilityPlay) {
        [capabilityList addObject:@"play"];
    }
    if (capabilityList.count > 0) {
        descriptor[@"capabilities"] = capabilityList;
    }

    return [descriptor copy];
}

- (void)emitAudioDevicesSnapshotLocked {
    if (!self.core) {
        [self emitDeviceChange:@[] active:nil];
        return;
    }

    bctbx_list_t *devices = linphone_core_get_audio_devices(self.core);
    LinphoneAudioDevice *activeDevice = linphone_core_get_output_audio_device(self.core);
    LinphoneAudioDevice *defaultDevice = linphone_core_get_default_output_audio_device(self.core);

    NSMutableArray<NSDictionary<NSString *, id> *> *items = [NSMutableArray array];
    NSDictionary<NSString *, id> *activeDescriptor = nil;

    for (bctbx_list_t *cursor = devices; cursor != NULL; cursor = cursor->next) {
        LinphoneAudioDevice *device = (LinphoneAudioDevice *)cursor->data;
        BOOL isActive = (activeDevice && device == activeDevice);
        NSDictionary<NSString *, id> *descriptor = [self dictionaryForAudioDevice:device
                                                                     activeDevice:activeDevice
                                                                    defaultDevice:defaultDevice];
        if (!descriptor) {
            continue;
        }
        [items addObject:descriptor];
        if (!activeDescriptor && isActive) {
            activeDescriptor = descriptor;
        }
    }

    if (devices) {
        bctbx_list_free(devices);
    }

    [self emitDeviceChange:items.copy active:activeDescriptor];
}

#pragma mark - Connectivity

- (void)handleConnectivityChange:(BOOL)reachable {
    [self emitConnectivityStatusLocked:reachable detail:nil];
}

- (void)refreshConnectivitySnapshotLocked {
    BOOL reachable = self.core ? linphone_core_is_network_reachable(self.core) : NO;
    [self emitConnectivityStatusLocked:reachable detail:nil];
}

- (void)emitConnectivityStatusLocked:(BOOL)reachable detail:(NSDictionary<NSString *, id> * _Nullable)detail {
    NSString *status = reachable ? @"online" : @"offline";
    self.lastConnectivityStatus = status;

    NSMutableDictionary<NSString *, id> *payload = [NSMutableDictionary dictionary];
    payload[@"status"] = status;

    NSMutableDictionary<NSString *, id> *detailPayload = [NSMutableDictionary dictionaryWithDictionary:detail ?: @{}];
    detailPayload[@"reachable"] = @(reachable);
    payload[@"detail"] = detailPayload;

    [self emitConnectivity:payload];
}

- (void)replaceCurrentCallLocked:(LinphoneCall *)call {
    if (self.currentCall == call) {
        return;
    }
    if (self.currentCall) {
        linphone_call_unref(self.currentCall);
        self.currentCall = NULL;
    }
    if (call) {
        self.currentCall = linphone_call_ref(call);
    }
}

- (void)handleRegistrationState:(LinphoneRegistrationState)state
                         message:(const char *)message
                         account:(LinphoneAccount *)account {
    NSString *stateString = RegistrationStateString(state);
    NSMutableDictionary *detail = [NSMutableDictionary dictionaryWithObject:stateString forKey:@"state"];
    NSString *msg = UTSStringFromCString(message);
    if (msg.length > 0) {
        detail[@"message"] = msg;
    }

    self.stateStorage[kRegistrationStateKey] = stateString ?: @"unknown";
    [self emitRegistrationState:stateString detail:detail];
}

- (void)handleCall:(LinphoneCall *)call
             state:(LinphoneCallState)state
           message:(const char *)message {
    NSString *stateString = CallStateString(state);
    NSMutableDictionary *detail = [NSMutableDictionary dictionary];
    detail[@"state"] = stateString ?: @"unknown";

    NSString *msg = UTSStringFromCString(message);
    if (msg.length > 0) {
        detail[@"message"] = msg;
    }

    if (call) {
        detail[@"direction"] = linphone_call_get_dir(call) == LinphoneCallOutgoing ? @"outgoing" : @"incoming";
        const LinphoneAddress *remote = linphone_call_get_remote_address(call);
        NSString *remoteString = [self stringFromAddress:remote];
        if (remoteString.length > 0) {
            detail[@"remoteAddress"] = remoteString;
        }

        LinphoneCallLog *log = linphone_call_get_call_log(call);
        if (log) {
            const char *callId = linphone_call_log_get_call_id(log);
            NSString *callIdString = UTSStringFromCString(callId);
            if (callIdString.length > 0) {
                detail[@"callId"] = callIdString;
            }
        }

        detail[@"reason"] = ReasonString(linphone_call_get_reason(call));
    }

    switch (state) {
        case LinphoneCallStateOutgoingInit:
        case LinphoneCallStateOutgoingProgress:
        case LinphoneCallStateOutgoingRinging:
        case LinphoneCallStateOutgoingEarlyMedia:
        case LinphoneCallStateIncomingReceived:
        case LinphoneCallStateIncomingEarlyMedia:
        case LinphoneCallStatePushIncomingReceived:
        case LinphoneCallStateConnected:
        case LinphoneCallStateStreamsRunning:
            [self replaceCurrentCallLocked:call];
            break;
        case LinphoneCallStateEnd:
        case LinphoneCallStateError:
        case LinphoneCallStateReleased:
            [self replaceCurrentCallLocked:NULL];
            break;
        default:
            break;
    }

    self.stateStorage[kCallStateKey] = stateString ?: @"unknown";
    [self emitCallState:stateString detail:detail];
}

- (void)handleMessage:(LinphoneChatMessage *)message
           inChatRoom:(LinphoneChatRoom *)chatRoom {
    if (!message) {
        return;
    }

    NSMutableDictionary *payload = [NSMutableDictionary dictionary];
    payload[@"event"] = @"received";

    NSString *text = UTSStringFromCString(linphone_chat_message_get_utf8_text(message));
    if (text.length > 0) {
        payload[@"text"] = text;
    }

    const LinphoneAddress *from = linphone_chat_message_get_from_address(message);
    NSString *fromString = [self stringFromAddress:from];
    if (fromString.length > 0) {
        payload[@"from"] = fromString;
    }

    const LinphoneAddress *to = linphone_chat_message_get_to_address(message);
    NSString *toString = [self stringFromAddress:to];
    if (toString.length > 0) {
        payload[@"to"] = toString;
    }

    const char *messageId = linphone_chat_message_get_message_id(message);
    NSString *messageIdString = UTSStringFromCString(messageId);
    if (messageIdString.length > 0) {
        payload[@"messageId"] = messageIdString;
    }

    payload[@"direction"] = linphone_chat_message_is_outgoing(message) ? @"outgoing" : @"incoming";

    [self emitMessageEvent:@"received" payload:payload.copy];
}

- (void)handleMessageStateChanged:(LinphoneChatMessage *)message
                             state:(LinphoneChatMessageState)state {
    if (!message) {
        return;
    }

    NSString *stateString = UTSStringFromCString(linphone_chat_message_state_to_string(state)) ?: @"";
    BOOL isSuccessState = (state == LinphoneChatMessageStateDelivered ||
                           state == LinphoneChatMessageStateDeliveredToUser ||
                           state == LinphoneChatMessageStateDisplayed ||
                           state == LinphoneChatMessageStateFileTransferDone);
    BOOL isFailureState = (state == LinphoneChatMessageStateNotDelivered ||
                           state == LinphoneChatMessageStateFileTransferError ||
                           state == LinphoneChatMessageStateFileTransferCancelling);

    if (!isSuccessState && !isFailureState) {
        return;
    }

    NSMutableDictionary<NSString *, id> *payload = [[self outboundMessagePayloadForMessage:message] mutableCopy];
    if (!payload) {
        payload = [NSMutableDictionary dictionary];
    }
    if (stateString.length > 0) {
        payload[@"state"] = stateString;
    }

    NSString *eventName = isSuccessState ? @"sent" : @"failed";

    if (isFailureState) {
        NSDictionary *errorPayload = [self errorPayloadForChatMessage:message];
        if (errorPayload) {
            payload[@"error"] = errorPayload;
        }
    }

    [self emitMessageEvent:eventName payload:payload.copy];
    [self unregisterMessageTrackingLocked:message];
}

- (NSDictionary<NSString *, id> *)outboundMessagePayloadForMessage:(LinphoneChatMessage *)message {
    if (!message) {
        return nil;
    }

    NSMutableDictionary<NSString *, id> *payload = [NSMutableDictionary dictionary];
    payload[@"direction"] = linphone_chat_message_is_outgoing(message) ? @"outgoing" : @"incoming";

    NSString *text = UTSStringFromCString(linphone_chat_message_get_utf8_text(message));
    if (text.length > 0) {
        payload[@"text"] = text;
    }

    const LinphoneAddress *to = linphone_chat_message_get_to_address(message);
    NSString *toString = [self stringFromAddress:to];
    if (toString.length > 0) {
        payload[@"to"] = toString;
    }

    const LinphoneAddress *from = linphone_chat_message_get_from_address(message);
    NSString *fromString = [self stringFromAddress:from];
    if (fromString.length > 0) {
        payload[@"from"] = fromString;
    }

    const char *messageId = linphone_chat_message_get_message_id(message);
    NSString *messageIdString = UTSStringFromCString(messageId);
    if (messageIdString.length > 0) {
        payload[@"messageId"] = messageIdString;
    }

    return [payload copy];
}

- (NSDictionary<NSString *, id> *)errorPayloadForChatMessage:(LinphoneChatMessage *)message {
    if (!message) {
        return nil;
    }

    const LinphoneErrorInfo *errorInfo = linphone_chat_message_get_error_info(message);
    LinphoneReason reason = linphone_chat_message_get_reason(message);
    NSString *reasonString = ReasonString(reason);

    NSMutableDictionary<NSString *, id> *errorPayload = [NSMutableDictionary dictionary];
    if (reasonString.length > 0 && ![reasonString isEqualToString:@"none"]) {
        errorPayload[@"code"] = reasonString;
    }

    if (errorInfo) {
        NSString *phrase = UTSStringFromCString(linphone_error_info_get_phrase(errorInfo)) ?: @"";
        if (phrase.length > 0) {
            errorPayload[@"message"] = phrase;
        }

        NSMutableDictionary<NSString *, id> *detail = [NSMutableDictionary dictionary];
        const char *protocol = linphone_error_info_get_protocol(errorInfo);
        NSString *protocolString = UTSStringFromCString(protocol);
        if (protocolString.length > 0) {
            detail[@"protocol"] = protocolString;
        }

        int protocolCode = linphone_error_info_get_protocol_code(errorInfo);
        if (protocolCode > 0) {
            detail[@"statusCode"] = @(protocolCode);
        }

        NSString *warnings = UTSStringFromCString(linphone_error_info_get_warnings(errorInfo));
        if (warnings.length > 0) {
            detail[@"warnings"] = warnings;
        }

        if (detail.count > 0) {
            errorPayload[@"detail"] = detail;
        }
    } else if (reasonString.length > 0 && ![reasonString isEqualToString:@"none"]) {
        errorPayload[@"message"] = reasonString;
    }

    return errorPayload.count > 0 ? [errorPayload copy] : nil;
}

- (void)handleAudioDeviceChange:(LinphoneAudioDevice *)device {
    NSString *route = [self routeStringForAudioDevice:device] ?: @"system";
    self.stateStorage[kAudioRouteKey] = route;
    [self emitAudioRoute:route];
    [self emitAudioDevicesSnapshotLocked];
}

- (void)handleAudioDevicesListUpdated {
    [self emitAudioDevicesSnapshotLocked];
}

#pragma mark - Utility accessors

- (NSString *)stringValueForKeys:(NSArray<NSString *> *)keys inDictionary:(NSDictionary *)dictionary {
    for (NSString *key in keys) {
        id value = dictionary[key];
        if ([value isKindOfClass:[NSString class]]) {
            NSString *trimmed = [value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
    }
    return nil;
}

- (NSNumber *)numberValueForKeys:(NSArray<NSString *> *)keys inDictionary:(NSDictionary *)dictionary {
    for (NSString *key in keys) {
        id value = dictionary[key];
        if ([value respondsToSelector:@selector(integerValue)]) {
            NSInteger intValue = [value integerValue];
            if (intValue > 0) {
                return @(intValue);
            }
        }
    }
    return nil;
}

#pragma mark - Event emission

- (void)emitRegistrationState:(NSString *)state detail:(NSDictionary<NSString *,id> * _Nullable)detail {
    id<LinphoneCApiWrapperDelegate> delegate = self.delegate;
    if (delegate && [delegate respondsToSelector:@selector(linphoneWrapper:didUpdateRegistrationState:detail:)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [delegate linphoneWrapper:self didUpdateRegistrationState:state detail:detail];
        });
    }
}

- (void)emitCallState:(NSString *)state detail:(NSDictionary<NSString *,id> * _Nullable)detail {
    id<LinphoneCApiWrapperDelegate> delegate = self.delegate;
    if (delegate && [delegate respondsToSelector:@selector(linphoneWrapper:didUpdateCallState:detail:)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [delegate linphoneWrapper:self didUpdateCallState:state detail:detail];
        });
    }
}

- (void)emitMessageEvent:(NSString *)event payload:(NSDictionary<NSString *,id> * _Nullable)payload {
    id<LinphoneCApiWrapperDelegate> delegate = self.delegate;
    if (delegate && [delegate respondsToSelector:@selector(linphoneWrapper:didReceiveMessageEvent:payload:)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [delegate linphoneWrapper:self didReceiveMessageEvent:event payload:payload];
        });
    }
}

- (void)emitAudioRoute:(NSString *)route {
    id<LinphoneCApiWrapperDelegate> delegate = self.delegate;
    if (delegate && [delegate respondsToSelector:@selector(linphoneWrapper:didUpdateAudioRoute:)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [delegate linphoneWrapper:self didUpdateAudioRoute:route];
        });
    }
}

- (void)emitDeviceChange:(NSArray<NSDictionary<NSString *, id> *> *)devices
                  active:(NSDictionary<NSString *, id> * _Nullable)active {
    id<LinphoneCApiWrapperDelegate> delegate = self.delegate;
    if (!delegate || ![delegate respondsToSelector:@selector(linphoneWrapper:didUpdateAudioDevices:active:)]) {
        return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
        [delegate linphoneWrapper:self didUpdateAudioDevices:devices ?: @[] active:active];
    });
}

- (void)emitConnectivity:(NSDictionary<NSString *, id> *)payload {
    id<LinphoneCApiWrapperDelegate> delegate = self.delegate;
    if (!delegate || ![delegate respondsToSelector:@selector(linphoneWrapper:didUpdateConnectivity:)]) {
        return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
        [delegate linphoneWrapper:self didUpdateConnectivity:payload ?: @{}];
    });
}

- (void)invokeCompletion:(void (^)(NSError * _Nullable))completion error:(NSError * _Nullable)error {
    if (!completion) {
        return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
        completion(error);
    });
}

- (NSError *)errorWithCode:(LinphoneWrapperErrorCode)code description:(NSString *)description {
    NSDictionary<NSString *, id> *userInfo = @{ NSLocalizedDescriptionKey: description ?: @"Unexpected error" };
    return [NSError errorWithDomain:LinphoneWrapperErrorDomain code:code userInfo:userInfo];
}

#pragma mark - C callbacks

static void LinphoneWrapperRegistrationStateChanged(LinphoneAccount *account,
                                                    LinphoneRegistrationState state,
                                                    const char *message) {
    LinphoneCApiWrapper *wrapper = (__bridge LinphoneCApiWrapper *)linphone_account_get_user_data(account);
    if (!wrapper) {
        return;
    }
    dispatch_async(wrapper.isolationQueue, ^{
        [wrapper handleRegistrationState:state message:message account:account];
    });
}

static void LinphoneWrapperCallStateChanged(LinphoneCore *core,
                                            LinphoneCall *call,
                                            LinphoneCallState state,
                                            const char *message) {
    LinphoneCApiWrapper *wrapper = (__bridge LinphoneCApiWrapper *)linphone_core_get_user_data(core);
    if (!wrapper) {
        return;
    }
    dispatch_async(wrapper.isolationQueue, ^{
        [wrapper handleCall:call state:state message:message];
    });
}

static void LinphoneWrapperMessageReceived(LinphoneCore *core,
                                           LinphoneChatRoom *chatRoom,
                                           LinphoneChatMessage *message) {
    LinphoneCApiWrapper *wrapper = (__bridge LinphoneCApiWrapper *)linphone_core_get_user_data(core);
    if (!wrapper) {
        return;
    }
    dispatch_async(wrapper.isolationQueue, ^{
        [wrapper handleMessage:message inChatRoom:chatRoom];
    });
}

static void LinphoneWrapperAudioDeviceChanged(LinphoneCore *core,
                                              LinphoneAudioDevice *device) {
    LinphoneCApiWrapper *wrapper = (__bridge LinphoneCApiWrapper *)linphone_core_get_user_data(core);
    if (!wrapper) {
        return;
    }
    dispatch_async(wrapper.isolationQueue, ^{
        [wrapper handleAudioDeviceChange:device];
    });
}

static void LinphoneWrapperAudioDevicesUpdated(LinphoneCore *core) {
    LinphoneCApiWrapper *wrapper = (__bridge LinphoneCApiWrapper *)linphone_core_get_user_data(core);
    if (!wrapper) {
        return;
    }
    dispatch_async(wrapper.isolationQueue, ^{
        [wrapper handleAudioDevicesListUpdated];
    });
}

static void LinphoneWrapperNetworkReachable(LinphoneCore *core, bool_t reachable) {
    LinphoneCApiWrapper *wrapper = (__bridge LinphoneCApiWrapper *)linphone_core_get_user_data(core);
    if (!wrapper) {
        return;
    }
    dispatch_async(wrapper.isolationQueue, ^{
        [wrapper handleConnectivityChange:(BOOL)reachable];
    });
}

static void LinphoneWrapperMessageStateChanged(LinphoneChatMessage *message,
                                               LinphoneChatMessageState state) {
    if (!message) {
        return;
    }
    LinphoneCore *core = linphone_chat_message_get_core(message);
    if (!core) {
        return;
    }
    LinphoneCApiWrapper *wrapper = (__bridge LinphoneCApiWrapper *)linphone_core_get_user_data(core);
    if (!wrapper) {
        return;
    }
    dispatch_async(wrapper.isolationQueue, ^{
        [wrapper handleMessageStateChanged:message state:state];
    });
}

@end

#import "LinphoneCApiWrapper.h"

static NSString *const LinphoneWrapperErrorDomain = @"com.utssdk.linphone.wrapper";

typedef NS_ENUM(NSInteger, LinphoneWrapperErrorCode) {
    LinphoneWrapperErrorCodeInvalidArguments = 1,
    LinphoneWrapperErrorCodeNotInitialized = 2
};

static NSString *const kRegistrationStateKey = @"registrationState";
static NSString *const kCallStateKey = @"callState";
static NSString *const kAudioRouteKey = @"audioRoute";
static NSString *const kConfigurationKey = @"configuration";

@interface LinphoneCApiWrapper ()
@property (nonatomic, strong) dispatch_queue_t isolationQueue;
@property (nonatomic, strong) NSMutableDictionary<NSString *, id> *stateStorage;
@property (nonatomic, copy, nullable) NSDictionary<NSString *, id> *configuration;
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
        _isolationQueue = dispatch_queue_create("com.utssdk.linphone.wrapper.state", DISPATCH_QUEUE_SERIAL);
        _stateStorage = [[NSMutableDictionary alloc] initWithDictionary:@{
            kRegistrationStateKey: @"none",
            kCallStateKey: @"none",
            kAudioRouteKey: @"unknown"
        }];
    }
    return self;
}

- (BOOL)initWithConfig:(NSDictionary<NSString *, id> *)config error:(NSError * _Nullable * _Nullable)error {
    if (![self validateConfiguration:config error:error]) {
        return NO;
    }

    dispatch_sync(self.isolationQueue, ^{
        self.configuration = [config copy];
        self.stateStorage[kConfigurationKey] = self.configuration ?: @{};
        self.stateStorage[kRegistrationStateKey] = @"none";
        self.stateStorage[kCallStateKey] = @"none";
        self.stateStorage[kAudioRouteKey] = @"system";
    });

    [self emitRegistrationState:@"none" detail:nil];
    [self emitAudioRoute:@"system"];

    return YES;
}

- (void)registerWithCompletion:(void (^)(NSError * _Nullable))completion {
    NSError *validationError = nil;
    if (![self ensureConfigured:&validationError]) {
        [self invokeCompletion:completion error:validationError];
        return;
    }

    dispatch_async(self.isolationQueue, ^{
        [self updateStateLockedForKey:kRegistrationStateKey value:@"progress"];
        [self emitRegistrationState:@"progress" detail:nil];

        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)), self.isolationQueue, ^{
            [self updateStateLockedForKey:kRegistrationStateKey value:@"ok"];
            [self emitRegistrationState:@"ok" detail:nil];
            [self invokeCompletion:completion error:nil];
        });
    });
}

- (void)unregisterWithCompletion:(void (^)(NSError * _Nullable))completion {
    NSError *validationError = nil;
    if (![self ensureConfigured:&validationError]) {
        [self invokeCompletion:completion error:validationError];
        return;
    }

    dispatch_async(self.isolationQueue, ^{
        [self updateStateLockedForKey:kRegistrationStateKey value:@"progress"];
        [self emitRegistrationState:@"progress" detail:nil];

        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)), self.isolationQueue, ^{
            [self updateStateLockedForKey:kRegistrationStateKey value:@"none"];
            [self emitRegistrationState:@"none" detail:nil];
            [self invokeCompletion:completion error:nil];
        });
    });
}

- (void)callDial:(NSString *)number completion:(void (^)(NSError * _Nullable))completion {
    NSError *error = nil;
    if (![self ensureConfigured:&error]) {
        [self invokeCompletion:completion error:error];
        return;
    }
    if (number.length == 0) {
        NSError *argumentError = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                                         description:@"Dialed number must not be empty."];
        [self invokeCompletion:completion error:argumentError];
        return;
    }

    dispatch_async(self.isolationQueue, ^{
        [self updateStateLockedForKey:kCallStateKey value:@"outgoing"];
        [self emitCallState:@"outgoing" detail:@{ @"number": number }];
        [self invokeCompletion:completion error:nil];
    });
}

- (void)callHangup:(void (^)(NSError * _Nullable))completion {
    NSError *error = nil;
    if (![self ensureConfigured:&error]) {
        [self invokeCompletion:completion error:error];
        return;
    }

    dispatch_async(self.isolationQueue, ^{
        [self updateStateLockedForKey:kCallStateKey value:@"ended"];
        [self emitCallState:@"ended" detail:nil];

        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)), self.isolationQueue, ^{
            [self updateStateLockedForKey:kCallStateKey value:@"none"];
            [self emitCallState:@"none" detail:nil];
            [self invokeCompletion:completion error:nil];
        });
    });
}

- (void)callAnswer:(void (^)(NSError * _Nullable))completion {
    NSError *error = nil;
    if (![self ensureConfigured:&error]) {
        [self invokeCompletion:completion error:error];
        return;
    }

    dispatch_async(self.isolationQueue, ^{
        [self updateStateLockedForKey:kCallStateKey value:@"connected"];
        [self emitCallState:@"connected" detail:nil];
        [self invokeCompletion:completion error:nil];
    });
}

- (void)sendDtmf:(NSString *)tone completion:(void (^)(NSError * _Nullable))completion {
    NSError *error = nil;
    if (![self ensureConfigured:&error]) {
        [self invokeCompletion:completion error:error];
        return;
    }
    if (tone.length == 0) {
        NSError *argumentError = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                                         description:@"DTMF tone must not be empty."];
        [self invokeCompletion:completion error:argumentError];
        return;
    }

    dispatch_async(self.isolationQueue, ^{
        [self invokeCompletion:completion error:nil];
    });
}

- (void)messageSendTo:(NSString *)recipient
                 body:(NSString *)body
            completion:(void (^)(NSError * _Nullable))completion {
    NSError *error = nil;
    if (![self ensureConfigured:&error]) {
        [self invokeCompletion:completion error:error];
        return;
    }
    if (recipient.length == 0 || body.length == 0) {
        NSError *argumentError = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments
                                         description:@"Recipient and body must not be empty."];
        [self invokeCompletion:completion error:argumentError];
        return;
    }

    dispatch_async(self.isolationQueue, ^{
        NSDictionary<NSString *, id> *payload = @{ @"from": self.configuration[@"username"] ?: @"",
                                                    @"to": recipient,
                                                    @"text": body };
        [self emitMessageEvent:@"sent" payload:payload];
        [self invokeCompletion:completion error:nil];
    });
}

- (void)setAudioRoute:(NSString *)route completion:(void (^)(NSError * _Nullable))completion {
    NSError *error = nil;
    if (![self ensureConfigured:&error]) {
        [self invokeCompletion:completion error:error];
        return;
    }

    NSString *normalizedRoute = route.length > 0 ? route : @"system";

    dispatch_async(self.isolationQueue, ^{
        [self updateStateLockedForKey:kAudioRouteKey value:normalizedRoute];
        [self emitAudioRoute:normalizedRoute];
        [self invokeCompletion:completion error:nil];
    });
}

- (NSDictionary<NSString *, id> *)getState {
    __block NSDictionary<NSString *, id> *snapshot = nil;
    dispatch_sync(self.isolationQueue, ^{
        snapshot = [self.stateStorage copy];
    });
    return snapshot ?: @{};
}

- (BOOL)validateConfiguration:(NSDictionary<NSString *, id> *)config error:(NSError * _Nullable * _Nullable)error {
    NSArray<NSString *> *requiredKeys = @[ @"sipServer", @"username", @"password" ];
    NSMutableArray<NSString *> *missingKeys = [[NSMutableArray alloc] init];

    for (NSString *key in requiredKeys) {
        id value = config[key];
        if (![value isKindOfClass:[NSString class]] || ((NSString *)value).length == 0) {
            [missingKeys addObject:key];
        }
    }

    if (missingKeys.count > 0) {
        if (error) {
            NSString *description = [NSString stringWithFormat:@"Missing configuration keys: %@",
                                      [missingKeys componentsJoinedByString:@", "]];
            *error = [self errorWithCode:LinphoneWrapperErrorCodeInvalidArguments description:description];
        }
        return NO;
    }

    return YES;
}

- (BOOL)ensureConfigured:(NSError * _Nullable * _Nullable)error {
    __block BOOL hasConfig = NO;
    dispatch_sync(self.isolationQueue, ^{
        hasConfig = (self.configuration != nil);
    });

    if (!hasConfig && error) {
        *error = [self errorWithCode:LinphoneWrapperErrorCodeNotInitialized
                         description:@"Linphone wrapper has not been initialized. Call initWithConfig first."];
    }

    return hasConfig;
}

- (void)updateStateLockedForKey:(NSString *)key value:(id)value {
    self.stateStorage[key] = value ?: @"";
}

- (NSError *)errorWithCode:(LinphoneWrapperErrorCode)code description:(NSString *)description {
    NSDictionary<NSString *, id> *userInfo = @{ NSLocalizedDescriptionKey: description ?: @"Unexpected error" };
    return [NSError errorWithDomain:LinphoneWrapperErrorDomain code:code userInfo:userInfo];
}

- (void)emitRegistrationState:(NSString *)state detail:(NSDictionary<NSString *, id> * _Nullable)detail {
    id<LinphoneCApiWrapperDelegate> delegate = self.delegate;
    if (delegate && [delegate respondsToSelector:@selector(linphoneWrapper:didUpdateRegistrationState:detail:)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [delegate linphoneWrapper:self didUpdateRegistrationState:state detail:detail];
        });
    }
}

- (void)emitCallState:(NSString *)state detail:(NSDictionary<NSString *, id> * _Nullable)detail {
    id<LinphoneCApiWrapperDelegate> delegate = self.delegate;
    if (delegate && [delegate respondsToSelector:@selector(linphoneWrapper:didUpdateCallState:detail:)]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [delegate linphoneWrapper:self didUpdateCallState:state detail:detail];
        });
    }
}

- (void)emitMessageEvent:(NSString *)event payload:(NSDictionary<NSString *, id> * _Nullable)payload {
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

- (void)invokeCompletion:(void (^)(NSError * _Nullable))completion error:(NSError * _Nullable)error {
    if (!completion) {
        return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
        completion(error);
    });
}

@end

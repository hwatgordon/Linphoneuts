#import "LinphoneCApiWrapper.h"

@interface LinphoneCApiWrapper ()
@property (nonatomic, assign, getter=isDisposed) BOOL disposed;
@property (nonatomic, strong) NSMutableDictionary *configuration;
@property (nonatomic, strong) NSMutableDictionary *mutableState;
@end

@implementation LinphoneCApiWrapper

- (instancetype)initWithConfiguration:(NSDictionary *)configuration {
  self = [super init];
  if (self) {
    _configuration = configuration ? [configuration mutableCopy] : [NSMutableDictionary dictionary];
    _mutableState = [NSMutableDictionary dictionary];
    _disposed = NO;
  }
  return self;
}

- (BOOL)initializeCore:(NSDictionary *)configuration error:(NSError * _Nullable __autoreleasing *)error {
  if (configuration) {
    [self.configuration addEntriesFromDictionary:configuration];
  }
  self.disposed = NO;
  self.mutableState[@"initialized"] = @YES;
  [self emitEvent:@"registration" payload:@{ @"state": @"none" }];
  [self emitEvent:@"device" payload:[self defaultDevicePayload]];
  return YES;
}

- (BOOL)registerAccount:(NSDictionary *)options error:(NSError * _Nullable __autoreleasing *)error {
  if (self.isDisposed) {
    [self rebuildState];
  }
  if (options) {
    [self.configuration addEntriesFromDictionary:options];
  }
  NSDictionary *payload = @{ @"state": @"ok", @"detail": options ?: @{}, @"status": @"registered" };
  self.mutableState[@"registration"] = payload;
  [self emitEvent:@"registration" payload:payload];
  return YES;
}

- (BOOL)unregisterAccount:(NSError * _Nullable __autoreleasing *)error {
  if (self.isDisposed) {
    return YES;
  }
  NSDictionary *payload = @{ @"state": @"none", @"status": @"unregistered" };
  self.mutableState[@"registration"] = payload;
  [self emitEvent:@"registration" payload:payload];
  return YES;
}

- (BOOL)dial:(NSDictionary *)payload error:(NSError * _Nullable __autoreleasing *)error {
  if (self.isDisposed) {
    return NO;
  }
  NSString *number = payload[@"number"] ?: @"";
  NSDictionary *eventPayload = @{ @"state": @"outgoing", @"number": number ?: @"" };
  self.mutableState[@"call"] = eventPayload;
  [self emitEvent:@"call" payload:eventPayload];
  return YES;
}

- (BOOL)answer:(NSError * _Nullable __autoreleasing *)error {
  if (self.isDisposed) {
    return NO;
  }
  NSMutableDictionary *call = [NSMutableDictionary dictionaryWithDictionary:self.mutableState[@"call"] ?: @{}];
  call[@"state"] = @"connected";
  self.mutableState[@"call"] = call;
  [self emitEvent:@"call" payload:call];
  return YES;
}

- (BOOL)hangup:(NSError * _Nullable __autoreleasing *)error {
  if (self.isDisposed) {
    return NO;
  }
  NSDictionary *payload = @{ @"state": @"ended", @"reason": @"hangup" };
  self.mutableState[@"call"] = payload;
  [self emitEvent:@"call" payload:payload];
  return YES;
}

- (BOOL)sendDtmf:(NSDictionary *)payload error:(NSError * _Nullable __autoreleasing *)error {
  if (self.isDisposed) {
    return NO;
  }
  NSString *tone = payload[@"tone"] ?: @"";
  NSDictionary *eventPayload = @{ @"state": @"connected", @"dtmf": tone ?: @"" };
  [self emitEvent:@"call" payload:eventPayload];
  return YES;
}

- (BOOL)sendMessage:(NSDictionary *)payload error:(NSError * _Nullable __autoreleasing *)error {
  if (self.isDisposed) {
    return NO;
  }
  NSMutableDictionary *message = [NSMutableDictionary dictionary];
  message[@"event"] = @"sent";
  if (payload[@"to"]) {
    message[@"payload"] = @{ @"to": payload[@"to"], @"text": payload[@"text"] ?: @"" };
  } else {
    message[@"payload"] = payload ?: @{};
  }
  [self emitEvent:@"message" payload:message];
  return YES;
}

- (BOOL)setAudioRoute:(NSDictionary *)payload error:(NSError * _Nullable __autoreleasing *)error {
  if (self.isDisposed) {
    return NO;
  }
  NSString *route = payload[@"route"] ?: @"system";
  self.mutableState[@"audioRoute"] = route;
  [self emitEvent:@"audio" payload:@{ @"route": route }];

  NSMutableDictionary *devices = [[self defaultDevicePayload] mutableCopy];
  NSMutableArray *entries = [NSMutableArray array];
  for (NSDictionary *item in devices[@"devices"]) {
    NSMutableDictionary *mutableItem = [item mutableCopy];
    mutableItem[@"selected"] = [mutableItem[@"type"] isEqualToString:route] ? @YES : @NO;
    [entries addObject:mutableItem];
  }
  devices[@"devices"] = entries;
  devices[@"activeRoute"] = route;
  [self emitEvent:@"device" payload:devices];
  return YES;
}

- (NSDictionary *)currentState {
  NSMutableDictionary *snapshot = [NSMutableDictionary dictionary];
  if (self.configuration) {
    snapshot[@"configuration"] = [self.configuration copy];
  }
  if (self.mutableState) {
    snapshot[@"state"] = [self.mutableState copy];
  }
  snapshot[@"disposed"] = @(self.isDisposed);
  return snapshot;
}

- (void)dispose {
  self.disposed = YES;
  [self.mutableState removeAllObjects];
  [self emitEvent:@"device" payload:@{ @"devices": @[], @"activeRoute": @"system" }];
}

#pragma mark - Helpers

- (NSDictionary *)defaultDevicePayload {
  return @{ @"devices": @[ \
              @{ @"id": @"system", @"name": @"System Default", @"type": @"system", @"selected": @YES }, \
              @{ @"id": @"speaker", @"name": @"Speaker", @"type": @"speaker", @"selected": @NO }, \
              @{ @"id": @"earpiece", @"name": @"Earpiece", @"type": @"earpiece", @"selected": @NO }], \
            @"activeRoute": @"system" };
}

- (void)emitEvent:(NSString *)event payload:(NSDictionary *)payload {
  if (!event || self.isDisposed) {
    return;
  }
  if (self.eventHandler) {
    self.eventHandler(event, payload);
  }
}

- (void)rebuildState {
  self.disposed = NO;
  [self.mutableState removeAllObjects];
  [self emitEvent:@"device" payload:[self defaultDevicePayload]];
}

@end

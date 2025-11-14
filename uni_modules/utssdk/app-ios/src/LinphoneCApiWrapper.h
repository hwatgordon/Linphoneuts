#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@class LinphoneCApiWrapper;

@protocol LinphoneCApiWrapperDelegate <NSObject>
@optional
- (void)linphoneWrapper:(LinphoneCApiWrapper *)wrapper
    didUpdateRegistrationState:(NSString *)state
                      detail:(nullable NSDictionary<NSString *, id> *)detail;
- (void)linphoneWrapper:(LinphoneCApiWrapper *)wrapper
      didUpdateCallState:(NSString *)state
                  detail:(nullable NSDictionary<NSString *, id> *)detail;
- (void)linphoneWrapper:(LinphoneCApiWrapper *)wrapper
    didReceiveMessageEvent:(NSString *)event
                   payload:(nullable NSDictionary<NSString *, id> *)payload;
- (void)linphoneWrapper:(LinphoneCApiWrapper *)wrapper
   didUpdateAudioRoute:(NSString *)route;
- (void)linphoneWrapper:(LinphoneCApiWrapper *)wrapper
    didUpdateAudioDevices:(NSArray<NSDictionary<NSString *, id> *> *)devices
                  active:(nullable NSDictionary<NSString *, id> *)activeDevice;
- (void)linphoneWrapper:(LinphoneCApiWrapper *)wrapper
    didUpdateConnectivity:(NSDictionary<NSString *, id> *)payload;
@end

@interface LinphoneCApiWrapper : NSObject

@property (class, nonatomic, readonly) LinphoneCApiWrapper *shared;
@property (nonatomic, weak, nullable) id<LinphoneCApiWrapperDelegate> delegate;

- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;

- (BOOL)initWithConfig:(NSDictionary<NSString *, id> *)config
                error:(NSError * _Nullable * _Nullable)error NS_SWIFT_NAME(configure(with:error:));
- (void)registerWithCompletion:(void (^)(NSError * _Nullable error))completion;
- (void)unregisterWithCompletion:(void (^)(NSError * _Nullable error))completion;
- (void)callDial:(NSString *)number completion:(void (^)(NSError * _Nullable error))completion;
- (void)callHangup:(void (^)(NSError * _Nullable error))completion;
- (void)callAnswer:(void (^)(NSError * _Nullable error))completion;
- (void)sendDtmf:(NSString *)tone completion:(void (^)(NSError * _Nullable error))completion;
- (void)messageSendTo:(NSString *)recipient
                 body:(NSString *)body
            completion:(void (^)(NSError * _Nullable error))completion;
- (void)setAudioRoute:(NSString *)route completion:(void (^)(NSError * _Nullable error))completion;
- (void)dispose;
- (NSDictionary<NSString *, id> *)getState;

@end

NS_ASSUME_NONNULL_END

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^LinphoneWrapperEventHandler)(NSString *event, NSDictionary * _Nullable payload);

@interface LinphoneCApiWrapper : NSObject

@property (nonatomic, copy, nullable) LinphoneWrapperEventHandler eventHandler;

- (instancetype)initWithConfiguration:(NSDictionary *)configuration;

- (BOOL)initializeCore:(NSDictionary *)configuration error:(NSError * _Nullable * _Nullable)error;
- (BOOL)registerAccount:(NSDictionary *)options error:(NSError * _Nullable * _Nullable)error;
- (BOOL)unregisterAccount:(NSError * _Nullable * _Nullable)error;
- (BOOL)dial:(NSDictionary *)payload error:(NSError * _Nullable * _Nullable)error;
- (BOOL)answer:(NSError * _Nullable * _Nullable)error;
- (BOOL)hangup:(NSError * _Nullable * _Nullable)error;
- (BOOL)sendDtmf:(NSDictionary *)payload error:(NSError * _Nullable * _Nullable)error;
- (BOOL)sendMessage:(NSDictionary *)payload error:(NSError * _Nullable * _Nullable)error;
- (BOOL)setAudioRoute:(NSDictionary *)payload error:(NSError * _Nullable * _Nullable)error;
- (NSDictionary *)currentState;
- (void)dispose;

@end

NS_ASSUME_NONNULL_END

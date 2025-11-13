//
//  LinlinCore.h
//  LinlinCore Real Framework
//
//  Real Linphone SDK - Extracted from linphone-ios5.4.36-sdk
//

#import <Foundation/Foundation.h>

//! Project version number for LinlinCore.
FOUNDATION_EXPORT double LinlinCoreVersionNumber;

//! Project version string for LinlinCore.
FOUNDATION_EXPORT const unsigned char LinlinCoreVersionString[];

// Import all real Linphone headers (C-compatible only)
#import "linphonecore.h"
#import "factory.h"
#import "core.h"
#import "call.h"
#import "account_creator.h"
#import "account_creator_service.h"
#import "call_params.h"
#import "call_stats.h"
#import "callbacks.h"
#import "chat.h"
#import "contactprovider.h"
#import "core_utils.h"
#import "defs.h"
#import "error_info.h"
// Exclude C++ headers: flexi-api-client.h
#import "friend.h"
#import "friendlist.h"
#import "headers.h"
#import "im_encryption_engine.h"
#import "im_notif_policy.h"
#import "info_message.h"
#import "linphone_proxy_config.h"
#import "linphone_tunnel.h"
#import "linphonecore_utils.h"
#import "linphonepresence.h"
#import "logging.h"
#import "lpconfig.h"
#import "misc.h"
#import "player.h"
#import "presence.h"
#import "proxy_config.h"
#import "ringtoneplayer.h"
#import "sipsetup.h"
#import "tunnel.h"
#import "types.h"
#import "vcard.h"
#import "video_definition.h"
#import "wrapper_utils.h"
#import "xmlrpc.h"

// Import C API headers
#import "api/c-api.h"
#import "api/c-factory.h"
#import "api/c-core.h"
#import "api/c-call.h"
#import "api/c-account.h"
#import "api/c-address.h"
#import "api/c-auth-info.h"
#import "api/c-audio-device.h"
#import "api/c-chat-room.h"
#import "api/c-chat-message.h"

// Import enums
#import "enums/c-enums.h"
#import "enums/call-enums.h"
#import "enums/chat-message-enums.h"
#import "enums/chat-room-enums.h"
#import "enums/conference-enums.h"

// Import utils (C-compatible only)
#import "utils/general.h"
// Exclude C++ headers: utils/utils.h, utils/enum-mask.h, utils/fs.h, utils/algorithm.h

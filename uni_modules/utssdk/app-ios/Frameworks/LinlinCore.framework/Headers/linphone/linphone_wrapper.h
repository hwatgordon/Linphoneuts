//
// linphone_wrapper.h - Linphone 包装头文件
// 提供传统的 linphone/linphone.h 包含路径支持
//

#ifndef LINPHONE_WRAPPER_H
#define LINPHONE_WRAPPER_H

// 包含实际的 Linphone 头文件
#include "../linphonecore.h"
#include "../core.h"
#include "../factory.h"
#include "../defs.h"

// 确保所有必要的定义都可用
#ifndef LINPHONE_PUBLIC
#define LINPHONE_PUBLIC
#endif

#endif // LINPHONE_WRAPPER_H

/*
 * android_utils.h
 * Copyright (C) 2010-2022 Belledonne Communications SARL
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 */

#ifndef android_utils_h
#define android_utils_h

// 只在Android平台包含JNI相关内容
#ifdef __ANDROID__
#include <jni.h>
#include "msfilter.h"
#include "mssndcard.h"

#ifdef __cplusplus
extern "C" {
#endif

// Android特定的函数声明
void ms_android_set_jvm(JavaVM *vm);
JavaVM *ms_android_get_jvm(void);
JNIEnv *ms_android_get_jni_env(void);
void ms_android_init_plugins(void);
void ms_android_init_sound_devices(void);
void ms_android_hack_cpu_count(void);

#ifdef __cplusplus
}
#endif

#else
// iOS平台 - 提供空的定义以保持兼容性
#ifdef __cplusplus
extern "C" {
#endif

// iOS平台不需要这些函数，提供空的内联定义
static inline void ms_android_set_jvm(void *vm) { /* iOS不需要 */ }
static inline void *ms_android_get_jvm(void) { return NULL; }
static inline void *ms_android_get_jni_env(void) { return NULL; }
static inline void ms_android_init_plugins(void) { /* iOS不需要 */ }
static inline void ms_android_init_sound_devices(void) { /* iOS不需要 */ }
static inline void ms_android_hack_cpu_count(void) { /* iOS不需要 */ }

#ifdef __cplusplus
}
#endif

#endif // __ANDROID__

#endif // android_utils_h

/*
 * bellesip-stub.h - Compatibility header for bellesip namespace
 * This file was missing from the framework and has been recreated for compatibility.
 */

#ifndef _BELLESIP_STUB_H_
#define _BELLESIP_STUB_H_

#include "../defs.h"

#ifdef __cplusplus
#include <memory>
#endif

#ifdef __cplusplus

// bellesip namespace stub for compilation compatibility
namespace bellesip {

// HybridObject template stub
template<typename cT, typename cppT>
class HybridObject {
public:
    HybridObject() = default;
    virtual ~HybridObject() = default;
    
    // Basic hybrid object operations (stubs for compilation)
    virtual cT* toC() { return nullptr; }
    virtual std::shared_ptr<cppT> getSharedFromThis() { return nullptr; }
    
    // Copy operations
    HybridObject(const HybridObject& other) = default;
    HybridObject& operator=(const HybridObject& other) = default;
};

} // namespace bellesip

#endif // __cplusplus

#endif // ifndef _BELLESIP_STUB_H_

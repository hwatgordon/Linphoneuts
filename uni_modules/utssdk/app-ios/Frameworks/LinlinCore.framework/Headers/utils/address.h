/*
 * address.h - Compatibility header for Linphone Address class
 * This file was missing from the framework and has been recreated for compatibility.
 */

#ifndef _LINPHONE_ADDRESS_H_
#define _LINPHONE_ADDRESS_H_

#include "../defs.h"

#ifdef __cplusplus

LINPHONE_BEGIN_NAMESPACE

// Forward declaration for Address class
class Address {
public:
    // Basic constructor/destructor
    Address() = default;
    virtual ~Address() = default;
    
    // Basic address operations (stubs for compilation)
    virtual const char* asString() const { return nullptr; }
    virtual const char* getScheme() const { return nullptr; }
    virtual const char* getUsername() const { return nullptr; }
    virtual const char* getDomain() const { return nullptr; }
    virtual int getPort() const { return 0; }
    
    // Copy operations
    Address(const Address& other) = default;
    Address& operator=(const Address& other) = default;
};

LINPHONE_END_NAMESPACE

#endif // __cplusplus

#endif // ifndef _LINPHONE_ADDRESS_H_

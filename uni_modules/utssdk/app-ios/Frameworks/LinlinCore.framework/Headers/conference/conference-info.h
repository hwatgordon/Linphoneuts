/*
 * conference-info.h - Compatibility header for Linphone ConferenceInfo class
 * This file was missing from the framework and has been recreated for compatibility.
 */

#ifndef _LINPHONE_CONFERENCE_INFO_H_
#define _LINPHONE_CONFERENCE_INFO_H_

#include "../defs.h"

#ifdef __cplusplus

LINPHONE_BEGIN_NAMESPACE

// Forward declaration for ConferenceInfo class
class ConferenceInfo {
public:
    // Basic constructor/destructor
    ConferenceInfo() = default;
    virtual ~ConferenceInfo() = default;
    
    // Basic conference info operations (stubs for compilation)
    virtual const char* getSubject() const { return nullptr; }
    virtual const char* getDescription() const { return nullptr; }
    virtual time_t getDateTime() const { return 0; }
    virtual int getDuration() const { return 0; }
    
    // Copy operations
    ConferenceInfo(const ConferenceInfo& other) = default;
    ConferenceInfo& operator=(const ConferenceInfo& other) = default;
};

LINPHONE_END_NAMESPACE

#endif // __cplusplus

#endif // ifndef _LINPHONE_CONFERENCE_INFO_H_

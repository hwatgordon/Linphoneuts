#ifndef JSON_JSON_H_STUB
#define JSON_JSON_H_STUB

// Minimal stub for <json/json.h> used by LinlinCore headers (FlexiAPIClient).
// This is NOT a full JSON implementation. It only provides the few symbols
// referenced by the framework headers so the app can compile.
// If the real jsoncpp is later provided, this stub will naturally be shadowed
// by the real headers in HEADER_SEARCH_PATHS.

#ifdef __cplusplus
#include <string>
#include <map>
#endif

namespace Json {

class Value {
public:
  Value() : is_object_(true) {}
  // Allow copy/assign
  Value(const Value&) = default;
  Value& operator=(const Value&) = default;

  // Index operator to emulate object access, e.g. value["key"] = "str";
  Value& operator[](const std::string& key) {
    is_object_ = true;
    return object_[key];
  }

  // Assign from std::string to emulate setting a string JSON value
  Value& operator=(const std::string& s) {
    is_object_ = false;
    str_ = s;
    object_.clear();
    return *this;
  }

  bool empty() const {
    return is_object_ ? object_.empty() : str_.empty();
  }

  // Helper used by the stub writeString
  std::string dump() const {
    if (is_object_) return "{}"; // minimal object representation
    return str_;
  }

private:
  bool is_object_;
  std::map<std::string, Value> object_;
  std::string str_;
};

class StreamWriterBuilder {
public:
  std::string& operator[](const std::string& key) { return settings_[key]; }
private:
  std::map<std::string, std::string> settings_;
};

// Minimal replacement for Json::writeString(builder, value)
static inline std::string writeString(const StreamWriterBuilder&, const Value& v) {
  return v.dump();
}

} // namespace Json

#endif // JSON_JSON_H_STUB

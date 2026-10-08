#include "spatial_core.h"
#include <jni.h>
#include <algorithm>
#include <sstream>
#include <iostream>
#include <cstring>
#include <cctype>

namespace homegen {

SpatialEngine::SpatialEngine() = default;
SpatialEngine::~SpatialEngine() {
    clear();
}

void SpatialEngine::clear() {
    lotBoundary_.clear();
    innerBuildable_.clear();
    segments_.clear();
}

Point2D SpatialEngine::projectCoordinates(const std::string& crs, double lon, double lat) {
    if (crs == "EPSG:3857") {
        return {lon, lat};
    }
    // EPSG:4326 to Mercator projection meters
    double rad = (lat * M_PI) / 180.0;
    double px = lon * 111319.49;
    double py = std::log(std::tan(M_PI / 4.0 + rad / 2.0)) * 6378137.0;
    return {px, py};
}

bool SpatialEngine::pointInPolygon(const Point2D& p, const std::vector<Point2D>& poly) {
    bool inside = false;
    size_t n = poly.size();
    if (n < 3) return false;
    for (size_t i = 0, j = n - 1; i < n; j = i++) {
        double xi = poly[i].x, yi = poly[i].y;
        double xj = poly[j].x, yj = poly[j].y;

        bool intersect = ((yi > p.y) != (yj > p.y)) &&
                         (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

bool SpatialEngine::lineIntersection(const Point2D& a1, const Point2D& a2,
                                     const Point2D& b1, const Point2D& b2, Point2D& outInter) {
    double dx1 = a2.x - a1.x;
    double dy1 = a2.y - a1.y;
    double dx2 = b2.x - b1.x;
    double dy2 = b2.y - b1.y;

    double denom = dx1 * dy2 - dy1 * dx2;
    if (std::abs(denom) < 1e-9) return false;

    double t1 = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
    outInter.x = a1.x + t1 * dx1;
    outInter.y = a1.y + t1 * dy1;
    return true;
}

double SpatialEngine::polygonArea(const std::vector<Point2D>& poly) {
    double area = 0.0;
    size_t n = poly.size();
    if (n < 3) return 0.0;
    for (size_t i = 0; i < n; i++) {
        size_t j = (i + 1) % n;
        area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
    }
    return area / 2.0;
}

Bounds2D SpatialEngine::getBounds(const std::vector<Point2D>& pts) {
    Bounds2D b{1e9, 1e9, -1e9, -1e9};
    for (const auto& p : pts) {
        if (p.x < b.minX) b.minX = p.x;
        if (p.y < b.minY) b.minY = p.y;
        if (p.x > b.maxX) b.maxX = p.x;
        if (p.y > b.maxY) b.maxY = p.y;
    }
    return b;
}

std::vector<Point2D> SpatialEngine::computeVariableBuffers(const std::vector<SetbackSegment>& segments) {
    if (segments.size() < 3) return {};

    std::vector<Point2D> outerPoints;
    for (const auto& s : segments) {
        outerPoints.push_back(s.p1);
    }

    bool isCCW = polygonArea(outerPoints) > 0.0;

    struct OffsetLine {
        Point2D offP1;
        Point2D offP2;
    };

    std::vector<OffsetLine> offsetLines;
    for (const auto& s : segments) {
        double dx = s.p2.x - s.p1.x;
        double dy = s.p2.y - s.p1.y;
        double len = std::hypot(dx, dy);
        if (len < 1e-6) len = 1.0;

        double nx = isCCW ? -dy / len : dy / len;
        double ny = isCCW ? dx / len : -dx / len;

        double sb = s.setback > 0.0 ? s.setback : 36.0;

        OffsetLine ol;
        ol.offP1 = {s.p1.x + nx * sb, s.p1.y + ny * sb};
        ol.offP2 = {s.p2.x + nx * sb, s.p2.y + ny * sb};
        offsetLines.push_back(ol);
    }

    std::vector<Point2D> innerPoints;
    size_t n = offsetLines.size();
    for (size_t i = 0; i < n; i++) {
        const auto& prev = offsetLines[(i + n - 1) % n];
        const auto& curr = offsetLines[i];

        Point2D inter;
        if (lineIntersection(prev.offP1, prev.offP2, curr.offP1, curr.offP2, inter)) {
            innerPoints.push_back({std::round(inter.x * 100.0) / 100.0, std::round(inter.y * 100.0) / 100.0});
        } else {
            innerPoints.push_back(curr.offP1);
        }
    }

    return innerPoints;
}

void SpatialEngine::setLotBoundary(const std::vector<Point2D>& lotPts) {
    lotBoundary_ = lotPts;
}

void SpatialEngine::setSegments(const std::vector<SetbackSegment>& segs) {
    segments_ = segs;
    innerBuildable_ = computeVariableBuffers(segments_);
}

// Simple JSON helper parser for spatial structures
static std::vector<double> extractNumbers(const std::string& str, const std::string& key) {
    std::vector<double> nums;
    size_t pos = str.find("\"" + key + "\"");
    if (pos == std::string::npos) return nums;

    size_t start = str.find('[', pos);
    if (start == std::string::npos) return nums;
    size_t end = str.find(']', start);
    if (end == std::string::npos) return nums;

    std::string arrStr = str.substr(start + 1, end - start - 1);
    std::stringstream ss(arrStr);
    std::string token;
    while (std::getline(ss, token, ',')) {
        try {
            size_t idx = 0;
            while (idx < token.length() && (std::isspace(token[idx]) || token[idx] == '[' || token[idx] == '{' || token[idx] == '"')) idx++;
            if (idx < token.length()) {
                nums.push_back(std::stod(token.substr(idx)));
            }
        } catch (...) {}
    }
    return nums;
}

bool SpatialEngine::loadJsonBuffer(const char* jsonStr, size_t length) {
    clear();
    if (!jsonStr || length == 0) return false;

    std::string content(jsonStr, length);

    // Extract CRS if present
    if (content.find("EPSG:3857") != std::string::npos) {
        crs_ = "EPSG:3857";
    } else {
        crs_ = "EPSG:4326";
    }

    // Extract lotBoundary coordinates if present
    std::vector<double> flatLot = extractNumbers(content, "lotBoundary");
    if (flatLot.size() >= 6) {
        for (size_t i = 0; i + 1 < flatLot.size(); i += 2) {
            lotBoundary_.push_back({flatLot[i], flatLot[i + 1]});
        }
    }

    // Extract innerPoints coordinates if present
    std::vector<double> flatInner = extractNumbers(content, "innerPoints");
    if (flatInner.size() >= 6) {
        for (size_t i = 0; i + 1 < flatInner.size(); i += 2) {
            innerBuildable_.push_back({flatInner[i], flatInner[i + 1]});
        }
    }

    // If segments exist, reconstruct inner buildable polygon
    if (segments_.empty() && lotBoundary_.size() >= 3 && innerBuildable_.empty()) {
        std::vector<SetbackSegment> segs;
        size_t n = lotBoundary_.size();
        for (size_t i = 0; i < n; i++) {
            SetbackSegment seg;
            seg.id = "seg-" + std::to_string(i + 1);
            seg.p1 = lotBoundary_[i];
            seg.p2 = lotBoundary_[(i + 1) % n];
            seg.setback = 36.0;
            segs.push_back(seg);
        }
        setSegments(segs);
    }

    return true;
}

std::vector<Violation> SpatialEngine::querySetbackViolations(const std::vector<Point2D>& roomPoly) const {
    std::vector<Violation> violations;
    if (roomPoly.empty()) return violations;

    // Check inner buildable boundary
    if (!innerBuildable_.empty() && innerBuildable_.size() >= 3) {
        for (const auto& pt : roomPoly) {
            if (!pointInPolygon(pt, innerBuildable_)) {
                Violation v;
                v.type = "setback-clearance";
                v.featureId = "setback-buffer";
                v.message = "Room vertex extends into setback buffer zone.";
                violations.push_back(v);
                break;
            }
        }
    }

    // Check property lot boundary
    if (!lotBoundary_.empty() && lotBoundary_.size() >= 3) {
        for (const auto& pt : roomPoly) {
            if (!pointInPolygon(pt, lotBoundary_)) {
                Violation v;
                v.type = "lot-boundary-exceeded";
                v.featureId = "lot-boundary";
                v.message = "Room extends outside property lot boundary.";
                violations.push_back(v);
                break;
            }
        }
    }

    return violations;
}

} // namespace homegen

// ============================================================================
// JNI Export Functions for com.homegen.spatial.SpatialCoreJni
// ============================================================================

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_homegen_spatial_SpatialCoreJni_nativeCreateEngine(JNIEnv* env, jclass clazz) {
    auto* engine = new homegen::SpatialEngine();
    return reinterpret_cast<jlong>(engine);
}

JNIEXPORT void JNICALL
Java_com_homegen_spatial_SpatialCoreJni_nativeDestroyEngine(JNIEnv* env, jclass clazz, jlong handle) {
    if (handle != 0) {
        auto* engine = reinterpret_cast<homegen::SpatialEngine*>(handle);
        delete engine;
    }
}

JNIEXPORT jboolean JNICALL
Java_com_homegen_spatial_SpatialCoreJni_nativeLoadJsonBuffer(JNIEnv* env, jclass clazz,
                                                             jlong handle, jobject directBuffer, jint length) {
    if (handle == 0 || directBuffer == nullptr) return JNI_FALSE;
    auto* engine = reinterpret_cast<homegen::SpatialEngine*>(handle);
    const char* buf = static_cast<const char*>(env->GetDirectBufferAddress(directBuffer));
    if (!buf) return JNI_FALSE;
    return engine->loadJsonBuffer(buf, static_cast<size_t>(length)) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_homegen_spatial_SpatialCoreJni_nativeLoadJsonString(JNIEnv* env, jclass clazz,
                                                             jlong handle, jstring jsonStr) {
    if (handle == 0 || jsonStr == nullptr) return JNI_FALSE;
    auto* engine = reinterpret_cast<homegen::SpatialEngine*>(handle);
    const char* str = env->GetStringUTFChars(jsonStr, nullptr);
    if (!str) return JNI_FALSE;
    jboolean res = engine->loadJsonBuffer(str, std::strlen(str)) ? JNI_TRUE : JNI_FALSE;
    env->ReleaseStringUTFChars(jsonStr, str);
    return res;
}

JNIEXPORT jstring JNICALL
Java_com_homegen_spatial_SpatialCoreJni_nativeQuerySetbackViolations(JNIEnv* env, jclass clazz,
                                                                     jlong handle, jdoubleArray flatRoomCoords) {
    if (handle == 0 || flatRoomCoords == nullptr) return env->NewStringUTF("[]");
    auto* engine = reinterpret_cast<homegen::SpatialEngine*>(handle);

    jsize len = env->GetArrayLength(flatRoomCoords);
    jdouble* coords = env->GetDoubleArrayElements(flatRoomCoords, nullptr);
    if (!coords) return env->NewStringUTF("[]");

    std::vector<homegen::Point2D> roomPoly;
    for (jsize i = 0; i + 1 < len; i += 2) {
        roomPoly.push_back({coords[i], coords[i + 1]});
    }

    env->ReleaseDoubleArrayElements(flatRoomCoords, coords, JNI_ABORT);

    auto violations = engine->querySetbackViolations(roomPoly);

    std::stringstream ss;
    ss << "[";
    for (size_t i = 0; i < violations.size(); i++) {
        if (i > 0) ss << ",";
        ss << "{\"type\":\"" << violations[i].type << "\","
           << "\"featureId\":\"" << violations[i].featureId << "\","
           << "\"msg\":\"" << violations[i].message << "\"}";
    }
    ss << "]";

    return env->NewStringUTF(ss.str().c_str());
}

JNIEXPORT jdoubleArray JNICALL
Java_com_homegen_spatial_SpatialCoreJni_nativeProjectCoordinates(JNIEnv* env, jclass clazz,
                                                                 jstring crs, jdouble lon, jdouble lat) {
    const char* crsStr = crs ? env->GetStringUTFChars(crs, nullptr) : "EPSG:4326";
    std::string crsStd = crsStr ? crsStr : "EPSG:4326";
    if (crs && crsStr) env->ReleaseStringUTFChars(crs, crsStr);

    homegen::Point2D proj = homegen::SpatialEngine::projectCoordinates(crsStd, lon, lat);

    jdoubleArray res = env->NewDoubleArray(2);
    jdouble buf[2] = {proj.x, proj.y};
    env->SetDoubleArrayRegion(res, 0, 2, buf);
    return res;
}

JNIEXPORT jdoubleArray JNICALL
Java_com_homegen_spatial_SpatialCoreJni_nativeComputeVariableBuffers(JNIEnv* env, jclass clazz,
                                                                      jdoubleArray flatSegmentData) {
    if (flatSegmentData == nullptr) return env->NewDoubleArray(0);
    jsize len = env->GetArrayLength(flatSegmentData);
    jdouble* data = env->GetDoubleArrayElements(flatSegmentData, nullptr);
    if (!data) return env->NewDoubleArray(0);

    // flatSegmentData format: [p1x, p1y, p2x, p2y, setback, ...] (stride 5)
    std::vector<homegen::SetbackSegment> segs;
    for (jsize i = 0; i + 4 < len; i += 5) {
        homegen::SetbackSegment seg;
        seg.id = "seg-" + std::to_string(segs.size() + 1);
        seg.p1 = {data[i], data[i + 1]};
        seg.p2 = {data[i + 2], data[i + 3]};
        seg.setback = data[i + 4];
        segs.push_back(seg);
    }

    env->ReleaseDoubleArrayElements(flatSegmentData, data, JNI_ABORT);

    auto inner = homegen::SpatialEngine::computeVariableBuffers(segs);

    jdoubleArray res = env->NewDoubleArray(inner.size() * 2);
    std::vector<jdouble> flatInner;
    for (const auto& pt : inner) {
        flatInner.push_back(pt.x);
        flatInner.push_back(pt.y);
    }
    if (!flatInner.empty()) {
        env->SetDoubleArrayRegion(res, 0, flatInner.size(), flatInner.data());
    }
    return res;
}

} // extern "C"

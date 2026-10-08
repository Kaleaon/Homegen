#ifndef SPATIAL_CORE_H
#define SPATIAL_CORE_H

#include <vector>
#include <string>
#include <memory>
#include <cstdint>
#include <cmath>

namespace homegen {

struct Point2D {
    double x = 0.0;
    double y = 0.0;
};

struct Bounds2D {
    double minX = 0.0;
    double minY = 0.0;
    double maxX = 0.0;
    double maxY = 0.0;

    bool overlaps(const Bounds2D& other, double eps = 0.001) const {
        return minX < other.maxX + eps && maxX > other.minX - eps &&
               minY < other.maxY + eps && maxY > other.minY - eps;
    }
};

struct SetbackSegment {
    std::string id;
    Point2D p1;
    Point2D p2;
    double setback = 36.0;
    std::string label;
};

struct Violation {
    std::string type;
    std::string featureId;
    std::string message;
};

class SpatialEngine {
public:
    SpatialEngine();
    ~SpatialEngine();

    void clear();

    // Coordinate reprojection
    static Point2D projectCoordinates(const std::string& crs, double lon, double lat);

    // Geometry utilities
    static bool pointInPolygon(const Point2D& p, const std::vector<Point2D>& poly);
    static bool lineIntersection(const Point2D& a1, const Point2D& a2,
                                const Point2D& b1, const Point2D& b2, Point2D& outInter);
    static double polygonArea(const std::vector<Point2D>& poly);
    static Bounds2D getBounds(const std::vector<Point2D>& pts);

    // Compute variable setback buffer polygon from lot boundary segments
    static std::vector<Point2D> computeVariableBuffers(const std::vector<SetbackSegment>& segments);

    // Load JSON buffer / string
    bool loadJsonBuffer(const char* jsonStr, size_t length);

    // Explicit setter for lot boundary & setback segments
    void setLotBoundary(const std::vector<Point2D>& lotPts);
    void setSegments(const std::vector<SetbackSegment>& segs);

    // Query room polygon setback violations
    std::vector<Violation> querySetbackViolations(const std::vector<Point2D>& roomPoly) const;

    const std::string& getCrs() const { return crs_; }
    void setCrs(const std::string& crs) { crs_ = crs; }

    const std::vector<Point2D>& getLotBoundary() const { return lotBoundary_; }
    const std::vector<Point2D>& getInnerBuildable() const { return innerBuildable_; }
    const std::vector<SetbackSegment>& getSegments() const { return segments_; }

private:
    std::string crs_ = "EPSG:4326";
    std::vector<Point2D> lotBoundary_;
    std::vector<Point2D> innerBuildable_;
    std::vector<SetbackSegment> segments_;
};

} // namespace homegen

#endif // SPATIAL_CORE_H

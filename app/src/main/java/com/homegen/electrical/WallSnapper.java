package com.homegen.electrical;

import com.homegen.designer3d.math.Vector3;

/**
 * Responsible for projecting points onto nearby walls.
 */
public interface WallSnapper {
    Vector3 snapToNearestWall(Vector3 point);
}

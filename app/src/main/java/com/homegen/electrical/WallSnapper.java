package com.homegen.electrical;

/**
 * Responsible for projecting points onto nearby walls.
 */
public interface WallSnapper {
    Vector3 snapToNearestWall(Vector3 point);
}

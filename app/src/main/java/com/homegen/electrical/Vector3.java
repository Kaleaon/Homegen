package com.homegen.electrical;

import java.util.Objects;

/**
 * Simple 3D point used by electrical planning tools in both 2D and 3D contexts.
 */
public final class Vector3 {
    private final double x;
    private final double y;
    private final double z;

    public Vector3(double x, double y, double z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    public double getX() {
        return x;
    }

    public double getY() {
        return y;
    }

    public double getZ() {
        return z;
    }

    public double distanceTo(Vector3 other) {
        double dx = x - other.x;
        double dy = y - other.y;
        double dz = z - other.z;
        return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Vector3)) {
            return false;
        }
        Vector3 vector3 = (Vector3) o;
        return Double.compare(vector3.x, x) == 0
                && Double.compare(vector3.y, y) == 0
                && Double.compare(vector3.z, z) == 0;
    }

    @Override
    public int hashCode() {
        return Objects.hash(x, y, z);
    }

    @Override
    public String toString() {
        return "Vector3{" +
                "x=" + x +
                ", y=" + y +
                ", z=" + z +
                '}';
    }
}

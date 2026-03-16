package com.homegen.designer3d.model

import com.homegen.designer3d.math.Vector3

class Wall(
    name: String = "Wall",
    var lengthMeters: Float = 3f,
    var heightMeters: Float = 2.7f,
    var thicknessMeters: Float = 0.15f,
    transform: Transform = Transform(),
    materialRef: String = "paint/white",
) : HomeObject(type = "wall", name = name, transform = transform, materialRef = materialRef)

class Floor(
    name: String = "Floor",
    var widthMeters: Float = 4f,
    var depthMeters: Float = 4f,
    transform: Transform = Transform(),
    materialRef: String = "floor/wood-oak",
) : HomeObject(type = "floor", name = name, transform = transform, materialRef = materialRef)

class Room(
    name: String = "Room",
    var dimensionsMeters: Vector3 = Vector3(4f, 2.7f, 4f),
    transform: Transform = Transform(),
    materialRef: String = "room/default",
) : HomeObject(type = "room", name = name, transform = transform, materialRef = materialRef)

class Furniture(
    name: String = "Furniture",
    var catalogRef: String = "generic/chair",
    transform: Transform = Transform(),
    materialRef: String = "fabric/gray",
) : HomeObject(type = "furniture", name = name, transform = transform, materialRef = materialRef)

class Staircase(
    name: String = "Staircase",
    var lowerFloor: Int = 0,
    var upperFloor: Int = 1,
    var widthMeters: Float = 1f,
    var depthMeters: Float = 2.5f,
    transform: Transform = Transform(),
    materialRef: String = "wood/oak",
) : HomeObject(type = "staircase", name = name, transform = transform, materialRef = materialRef)

class Door(
    name: String = "Door",
    var widthMeters: Float = 0.9f,
    var heightMeters: Float = 2.1f,
    var wallId: String? = null,
    transform: Transform = Transform(),
    materialRef: String = "wood/oak",
) : HomeObject(type = "door", name = name, transform = transform, materialRef = materialRef)

class Window(
    name: String = "Window",
    var widthMeters: Float = 1.2f,
    var heightMeters: Float = 1.0f,
    var sillHeight: Float = 0.9f,
    var wallId: String? = null,
    transform: Transform = Transform(),
    materialRef: String = "glass/clear",
) : HomeObject(type = "window", name = name, transform = transform, materialRef = materialRef)

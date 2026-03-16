package com.homegen.designer3d.input

import android.view.MotionEvent
import android.view.View
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.hypot

/**
 * Touch gesture detector with state machine for tap, drag, orbit, pan, and pinch.
 */
interface GestureListener {
    fun onTap(screenX: Float, screenY: Float)
    fun onLongPress(screenX: Float, screenY: Float) {}
    fun onDragStart(screenX: Float, screenY: Float)
    fun onDragMove(screenX: Float, screenY: Float, deltaX: Float, deltaY: Float)
    fun onDragEnd()
    fun onOrbit(deltaYaw: Float, deltaPitch: Float)
    fun onPan(deltaX: Float, deltaY: Float)
    fun onZoom(scaleFactor: Float)
}

class GestureHandler(private val listener: GestureListener) : View.OnTouchListener {

    private enum class State { IDLE, TAP_PENDING, DRAGGING, TWO_FINGER }

    private var state = State.IDLE
    private var downX = 0f
    private var downY = 0f
    private var downTime = 0L
    private var lastX = 0f
    private var lastY = 0f

    // Two-finger tracking
    private var lastSpan = 0f
    private var lastAngle = 0f
    private var lastMidX = 0f
    private var lastMidY = 0f

    companion object {
        private const val TAP_TIMEOUT_MS = 250L
        private const val TAP_SLOP_PX = 15f
        private const val LONG_PRESS_MS = 500L
        private const val ORBIT_SENSITIVITY = 0.005f
        private const val PAN_SENSITIVITY = 0.02f
    }

    override fun onTouch(v: View, event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.x
                downY = event.y
                downTime = System.currentTimeMillis()
                lastX = event.x
                lastY = event.y
                state = State.TAP_PENDING
            }

            MotionEvent.ACTION_POINTER_DOWN -> {
                if (state == State.DRAGGING) {
                    listener.onDragEnd()
                }
                state = State.TWO_FINGER
                updateTwoFingerState(event)
            }

            MotionEvent.ACTION_MOVE -> {
                when (state) {
                    State.TAP_PENDING -> {
                        val dx = event.x - downX
                        val dy = event.y - downY
                        if (hypot(dx, dy) > TAP_SLOP_PX) {
                            state = State.DRAGGING
                            listener.onDragStart(downX, downY)
                        } else if (System.currentTimeMillis() - downTime > LONG_PRESS_MS) {
                            listener.onLongPress(downX, downY)
                            state = State.IDLE
                        }
                    }
                    State.DRAGGING -> {
                        val dx = event.x - lastX
                        val dy = event.y - lastY
                        listener.onDragMove(event.x, event.y, dx, dy)
                    }
                    State.TWO_FINGER -> {
                        if (event.pointerCount >= 2) {
                            handleTwoFingerMove(event)
                        }
                    }
                    State.IDLE -> {}
                }
                lastX = event.x
                lastY = event.y
            }

            MotionEvent.ACTION_POINTER_UP -> {
                if (event.pointerCount <= 2) {
                    state = State.IDLE
                }
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                when (state) {
                    State.TAP_PENDING -> {
                        val elapsed = System.currentTimeMillis() - downTime
                        if (elapsed < TAP_TIMEOUT_MS) {
                            listener.onTap(event.x, event.y)
                        }
                    }
                    State.DRAGGING -> listener.onDragEnd()
                    else -> {}
                }
                state = State.IDLE
            }
        }
        return true
    }

    private fun updateTwoFingerState(event: MotionEvent) {
        if (event.pointerCount < 2) return
        val x0 = event.getX(0); val y0 = event.getY(0)
        val x1 = event.getX(1); val y1 = event.getY(1)
        lastSpan = hypot(x1 - x0, y1 - y0)
        lastAngle = atan2(y1 - y0, x1 - x0)
        lastMidX = (x0 + x1) / 2f
        lastMidY = (y0 + y1) / 2f
    }

    private fun handleTwoFingerMove(event: MotionEvent) {
        val x0 = event.getX(0); val y0 = event.getY(0)
        val x1 = event.getX(1); val y1 = event.getY(1)

        val span = hypot(x1 - x0, y1 - y0)
        val angle = atan2(y1 - y0, x1 - x0)
        val midX = (x0 + x1) / 2f
        val midY = (y0 + y1) / 2f

        // Pinch zoom
        if (lastSpan > 0f && span > 0f) {
            val scaleFactor = span / lastSpan
            if (abs(scaleFactor - 1f) > 0.01f) {
                listener.onZoom((scaleFactor - 1f) * 5f)
            }
        }

        // Pan (mid-point movement)
        val panDx = midX - lastMidX
        val panDy = midY - lastMidY
        if (abs(panDx) > 1f || abs(panDy) > 1f) {
            listener.onPan(panDx * PAN_SENSITIVITY, -panDy * PAN_SENSITIVITY)
        }

        // Orbit (angle change)
        val angleDelta = angle - lastAngle
        if (abs(angleDelta) > 0.01f) {
            listener.onOrbit(angleDelta, 0f)
        }

        lastSpan = span
        lastAngle = angle
        lastMidX = midX
        lastMidY = midY
    }
}

package com.homegen.designer3d.rendering

import android.content.Context
import android.view.Choreographer
import android.view.SurfaceView
import com.google.android.filament.Camera
import com.google.android.filament.Engine
import com.google.android.filament.Renderer
import com.google.android.filament.Scene
import com.google.android.filament.View
import com.google.android.filament.Viewport
import com.google.android.filament.android.DisplayHelper
import com.google.android.filament.android.UiHelper
import com.homegen.designer3d.SceneController
import com.homegen.designer3d.camera.CameraController

/**
 * Encapsulates the Filament engine lifecycle: init, frame loop, destroy.
 * Owns Engine, Renderer, Scene, View, UiHelper, and the Choreographer frame callback.
 */
class FilamentSurfaceManager(context: Context) {

    val engine: Engine = Engine.create()
    val renderer: Renderer = engine.createRenderer()
    val filamentScene: Scene = engine.createScene()
    val filamentView: View = engine.createView().apply { scene = filamentScene }

    val sceneController = SceneController(engine, filamentView, filamentScene)

    private val uiHelper = UiHelper(UiHelper.ContextErrorPolicy.DONT_CHECK)
    private val displayHelper = DisplayHelper(context)

    private var camera: Camera? = null
    private var viewportWidth = 0
    private var viewportHeight = 0

    private val materialFactory = MaterialFactory(engine)
    val renderableRegistry = RenderableRegistry(engine, filamentScene, materialFactory)
    private val objLoader = ObjLoader(engine, context.assets)
    private val modelLoader = ModelLoader(engine, context.assets)

    private val lighting = SceneLighting()

    private val choreographer = Choreographer.getInstance()
    private val frameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            choreographer.postFrameCallback(this)
            // Sync camera each frame
            camera?.let { cam ->
                FilamentCameraSync.sync(sceneController.cameraController, cam)
            }
            if (renderer.beginFrame(uiHelper.swapChain!!, frameTimeNanos)) {
                renderer.render(filamentView)
                renderer.endFrame()
            }
        }
    }

    init {
        renderableRegistry.objLoader = objLoader
        renderableRegistry.modelLoader = modelLoader
        sceneController.renderableRegistry = renderableRegistry
        lighting.setup(engine, filamentScene)

        // Create ground grid
        val gridMaterial = materialFactory.createGridInstance()
        val gridEntity = MeshFactory.createPlane(engine, 50f, 50f, gridMaterial)
        filamentScene.addEntity(gridEntity)
    }

    fun createSurfaceView(context: Context): SurfaceView {
        val sv = SurfaceView(context)
        uiHelper.renderCallback = object : UiHelper.RendererCallback {
            override fun onNativeWindowChanged(surface: android.view.Surface) {
                uiHelper.swapChain = engine.createSwapChain(surface)
            }

            override fun onDetachedFromSurface() {
                uiHelper.swapChain?.let { engine.destroySwapChain(it) }
            }

            override fun onResized(width: Int, height: Int) {
                filamentView.viewport = Viewport(0, 0, width, height)
                viewportWidth = width
                viewportHeight = height
                val aspect = width.toDouble() / height.toDouble()

                if (camera == null) {
                    camera = engine.createCamera(engine.entityManager.create())
                }
                camera!!.setProjection(45.0, aspect, 0.1, 100.0, Camera.Fov.VERTICAL)
                filamentView.camera = camera
            }
        }
        uiHelper.attachTo(sv)
        return sv
    }

    fun getCamera(): Camera? = camera
    fun getViewport(): Pair<Int, Int> = viewportWidth to viewportHeight

    fun resume() {
        choreographer.postFrameCallback(frameCallback)
    }

    fun pause() {
        choreographer.removeFrameCallback(frameCallback)
    }

    fun destroy() {
        choreographer.removeFrameCallback(frameCallback)
        uiHelper.detach()
        lighting.destroy(engine)
        renderableRegistry.destroy()
        objLoader.clearCache()
        modelLoader.destroy()
        materialFactory.destroy()
        engine.destroyRenderer(renderer)
        engine.destroyView(filamentView)
        engine.destroyScene(filamentScene)
        engine.destroy()
    }
}

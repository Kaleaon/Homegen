package com.homegen.designer3d.rendering

import android.content.Context
import android.view.Choreographer
import android.view.SurfaceView
import com.google.android.filament.Camera
import com.google.android.filament.Engine
import com.google.android.filament.Renderer
import com.google.android.filament.Scene
import com.google.android.filament.SwapChain
import com.google.android.filament.Texture
import com.google.android.filament.View
import com.google.android.filament.Viewport
import com.google.android.filament.android.DisplayHelper
import com.google.android.filament.android.UiHelper
import com.homegen.designer3d.SceneController
import java.nio.ByteBuffer
import java.nio.ByteOrder

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
    private var swapChain: SwapChain? = null

    private var camera: Camera? = null
    private var viewportWidth = 0
    private var viewportHeight = 0

    val materialFactory = MaterialFactory(engine)
    val renderableRegistry = RenderableRegistry(engine, filamentScene, materialFactory)
    private val objLoader = ObjLoader(engine, context.assets)
    private val modelLoader = ModelLoader(engine, context.assets)

    private val lighting = SceneLighting()

    private var terrainEntity: Int = 0
    private var terrainTexture: Texture? = null

    private val choreographer = Choreographer.getInstance()
    private val frameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            choreographer.postFrameCallback(this)
            // Sync camera each frame
            camera?.let { cam ->
                FilamentCameraSync.sync(sceneController.cameraController, cam)
            }
            swapChain?.let { sc ->
                if (renderer.beginFrame(sc, frameTimeNanos)) {
                    renderer.render(filamentView)
                    renderer.endFrame()
                }
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

    /**
     * Binds a heightmap raster texture and displaces terrain vertices on the GPU.
     */
    fun setTerrainHeightmap(
        data: FloatArray,
        width: Int,
        height: Int,
        verticalScale: Float = 1.0f,
        minElevation: Float = 0f,
        maxElevation: Float = 10f,
        forceFlatFallback: Boolean = false,
    ) {
        removeTerrain()

        var texture: Texture? = null
        if (width > 0 && height > 0 && data.isNotEmpty()) {
            try {
                texture = Texture.Builder()
                    .width(width)
                    .height(height)
                    .levels(1)
                    .sampler(Texture.Sampler.SAMPLER_2D)
                    .format(Texture.InternalFormat.R32F)
                    .build(engine)

                val buf = ByteBuffer.allocateDirect(data.size * 4).order(ByteOrder.nativeOrder())
                buf.asFloatBuffer().put(data)
                buf.rewind()

                val pixelBuffer = Texture.PixelBufferDescriptor(
                    buf,
                    Texture.Format.R,
                    Texture.Type.FLOAT,
                )
                texture.setImage(engine, 0, pixelBuffer)
                terrainTexture = texture
            } catch (e: Exception) {
                // Fall back if R32F texture creation fails
            }
        }

        val terrainMat = materialFactory.createTerrainInstance(
            texture = terrainTexture,
            verticalScale = verticalScale,
            minElevation = minElevation,
            maxElevation = maxElevation,
            forceFlatFallback = forceFlatFallback,
        )

        val entity = MeshFactory.createSubdividedPlane(
            engine = engine,
            width = 100f,
            depth = 100f,
            subdivisionsX = 64,
            subdivisionsZ = 64,
            materialInstance = terrainMat,
            heightmapData = if (forceFlatFallback || !materialFactory.isVertexTextureFetchSupported) null else data,
            verticalScale = verticalScale,
        )

        terrainEntity = entity
        filamentScene.addEntity(entity)
    }

    /**
     * Safely cleans up terrain entities and textures to prevent native Filament memory leaks.
     */
    fun removeTerrain() {
        if (terrainEntity != 0) {
            filamentScene.removeEntity(terrainEntity)
            engine.destroyEntity(terrainEntity)
            terrainEntity = 0
        }
        terrainTexture?.let { tex ->
            engine.destroyTexture(tex)
            terrainTexture = null
        }
    }

    fun createSurfaceView(context: Context): SurfaceView {
        val sv = SurfaceView(context)
        uiHelper.renderCallback = object : UiHelper.RendererCallback {
            override fun onNativeWindowChanged(surface: android.view.Surface) {
                swapChain?.let { engine.destroySwapChain(it) }
                swapChain = engine.createSwapChain(surface)
            }

            override fun onDetachedFromSurface() {
                swapChain?.let { engine.destroySwapChain(it) }
                swapChain = null
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
        removeTerrain()
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

package com.homegen.designer3d.rendering

import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.IndirectLight
import com.google.android.filament.LightManager
import com.google.android.filament.Scene
import com.google.android.filament.Skybox

/**
 * Sets up scene lighting: directional sun, ambient indirect light, and skybox.
 */
class SceneLighting {

    private var sunEntity: Int = 0
    private var indirectLight: IndirectLight? = null
    private var skybox: Skybox? = null

    fun setup(engine: Engine, scene: Scene) {
        // Directional sun light
        sunEntity = EntityManager.get().create()
        LightManager.Builder(LightManager.Type.DIRECTIONAL)
            .color(1.0f, 0.95f, 0.9f)
            .intensity(100_000f)
            .direction(-0.4f, -0.8f, -0.3f)
            .castShadows(true)
            .build(engine, sunEntity)
        scene.addEntity(sunEntity)

        // Ambient indirect light using flat SH bands (uniform ambient)
        val harmonics = floatArrayOf(
            0.5f, 0.5f, 0.5f, // Band 0 (ambient)
            0f, 0f, 0f,       // Band 1
            0f, 0f, 0f,
            0f, 0f, 0f,
            0f, 0f, 0f,       // Band 2
            0f, 0f, 0f,
            0f, 0f, 0f,
            0f, 0f, 0f,
            0f, 0f, 0f
        )
        indirectLight = IndirectLight.Builder()
            .irradiance(3, harmonics)
            .intensity(30_000f)
            .build(engine)
        scene.indirectLight = indirectLight

        // Solid color skybox (light gray-blue)
        skybox = Skybox.Builder()
            .color(0.85f, 0.88f, 0.92f, 1.0f)
            .build(engine)
        scene.skybox = skybox
    }

    fun destroy(engine: Engine) {
        if (sunEntity != 0) {
            engine.destroyEntity(sunEntity)
            EntityManager.get().destroy(sunEntity)
        }
        indirectLight?.let { engine.destroyIndirectLight(it) }
        skybox?.let { engine.destroySkybox(it) }
    }
}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.homegen"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.homegen"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("com.google.android.filament:filament-android:1.56.0")
    implementation("com.google.android.filament:gltfio-android:1.56.0")
    implementation("com.google.android.filament:filament-utils-android:1.56.0")

    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.4")
    implementation("androidx.core:core-ktx:1.13.1")
}

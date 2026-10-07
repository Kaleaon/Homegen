package com.homegen.assets.ui

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import com.homegen.assets.data.CatalogRepository
import com.homegen.assets.model.Catalog
import com.homegen.assets.model.CatalogCategory
import com.homegen.assets.model.Dimensions3
import com.homegen.assets.model.PlaceableAsset
import com.ktheme.android.KthemeComposeTheme
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CatalogPanelTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private lateinit var context: Context
    private lateinit var repository: CatalogRepository
    private lateinit var sampleCatalog: Catalog

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        repository = CatalogRepository(context)

        val chairAsset = PlaceableAsset(
            id = "chair_nordic",
            name = "Nordic Chair",
            category = "furniture/chairs",
            tags = listOf("scandinavian", "chair", "wood"),
            modelPath = "models/chair.obj",
            thumbnailPath = "textures/chair.png",
            footprintMeters = Dimensions3(0.5f, 0.5f, 0.9f),
        )

        sampleCatalog = Catalog(
            version = 1,
            materials = emptyList(),
            placeableObjects = listOf(chairAsset),
        )
    }

    @Test
    fun `displays catalog items when filter matches entries`() {
        composeTestRule.setContent {
            KthemeComposeTheme {
                CatalogPanel(
                    catalog = sampleCatalog,
                    repository = repository,
                    onMaterialPicked = {},
                    onPlaceablePicked = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Nordic Chair").assertIsDisplayed()
    }

    @Test
    fun `displays EmptyCatalogState with query feedback when search returns zero items`() {
        composeTestRule.setContent {
            KthemeComposeTheme {
                CatalogPanel(
                    catalog = sampleCatalog,
                    repository = repository,
                    onMaterialPicked = {},
                    onPlaceablePicked = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Search catalog").performTextInput("nonexistent")

        composeTestRule.onNodeWithText("No Items Found").assertIsDisplayed()
        composeTestRule.onNodeWithText("No items matching \"nonexistent\".").assertIsDisplayed()
        composeTestRule.onNodeWithText("Reset Filters").assertIsDisplayed()
    }

    @Test
    fun `clicking Reset Filters clears search and restores catalog items`() {
        composeTestRule.setContent {
            KthemeComposeTheme {
                CatalogPanel(
                    catalog = sampleCatalog,
                    repository = repository,
                    onMaterialPicked = {},
                    onPlaceablePicked = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Search catalog").performTextInput("nonexistent")
        composeTestRule.onNodeWithText("No Items Found").assertIsDisplayed()

        composeTestRule.onNodeWithText("Reset Filters").performClick()

        composeTestRule.onNodeWithText("Nordic Chair").assertIsDisplayed()
    }

    @Test
    fun `EmptyCatalogState formats feedback for category and style tag criteria`() {
        composeTestRule.setContent {
            KthemeComposeTheme {
                EmptyCatalogState(
                    search = "table",
                    selectedCategory = CatalogCategory.WALLS,
                    activeStyleTag = "modern",
                    onResetFilters = {},
                )
            }
        }

        composeTestRule.onNodeWithText("No Items Found").assertIsDisplayed()
        composeTestRule.onNodeWithText(
            "No items matching \"table\" in category \"Walls\" with style \"modern\".",
        ).assertIsDisplayed()
        composeTestRule.onNodeWithText("Reset Filters").assertIsDisplayed()
    }

    @Test
    fun `resetting filters clears active style tag filter when search is empty`() {
        composeTestRule.setContent {
            KthemeComposeTheme {
                CatalogPanel(
                    catalog = sampleCatalog,
                    repository = repository,
                    activeStyleTag = "industrial",
                    onMaterialPicked = {},
                    onPlaceablePicked = {},
                )
            }
        }

        // sampleCatalog only has "scandinavian" tag so "industrial" filter returns 0 items
        composeTestRule.onNodeWithText("No Items Found").assertIsDisplayed()

        composeTestRule.onNodeWithText("Reset Filters").performClick()

        composeTestRule.onNodeWithText("Nordic Chair").assertIsDisplayed()
    }
}

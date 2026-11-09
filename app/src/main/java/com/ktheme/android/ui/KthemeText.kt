package com.ktheme.android.ui

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import com.ktheme.android.KthemeComposeTheme

enum class KthemeTextVariant {
    Default,
    Primary,
    Secondary,
    Muted,
    Brand,
    Highlight,
    Danger,
}

/**
 * Text primitive that applies Ktheme typography casing rules and semantic colors.
 */
@Composable
fun KthemeText(
    text: String,
    modifier: Modifier = Modifier,
    variant: KthemeTextVariant = KthemeTextVariant.Default,
    color: Color = Color.Unspecified,
    fontSize: TextUnit = TextUnit.Unspecified,
    fontStyle: FontStyle? = null,
    fontWeight: FontWeight? = null,
    fontFamily: FontFamily? = null,
    letterSpacing: TextUnit = TextUnit.Unspecified,
    textDecoration: TextDecoration? = null,
    textAlign: TextAlign? = null,
    lineHeight: TextUnit = TextUnit.Unspecified,
    overflow: TextOverflow = TextOverflow.Clip,
    softWrap: Boolean = true,
    maxLines: Int = Int.MAX_VALUE,
    minLines: Int = 1,
    onTextLayout: ((TextLayoutResult) -> Unit)? = null,
    style: TextStyle = LocalTextStyle.current,
) {
    val layout = KthemeComposeTheme.layout
    val colors = KthemeComposeTheme.colors

    val displayText = if (layout.contentCase == "uppercase") {
        text.uppercase()
    } else {
        text
    }

    val resolvedColor = when {
        color != Color.Unspecified -> color
        variant == KthemeTextVariant.Primary -> colors.onCardBackground
        variant == KthemeTextVariant.Secondary || variant == KthemeTextVariant.Muted -> colors.onCardBackgroundAlt
        variant == KthemeTextVariant.Brand -> colors.brand
        variant == KthemeTextVariant.Highlight -> colors.highlight
        variant == KthemeTextVariant.Danger -> colors.danger
        style.color != Color.Unspecified -> style.color
        else -> colors.onCardBackground
    }

    Text(
        text = displayText,
        modifier = modifier,
        color = resolvedColor,
        fontSize = fontSize,
        fontStyle = fontStyle,
        fontWeight = fontWeight,
        fontFamily = fontFamily,
        letterSpacing = letterSpacing,
        textDecoration = textDecoration,
        textAlign = textAlign,
        lineHeight = lineHeight,
        overflow = overflow,
        softWrap = softWrap,
        maxLines = maxLines,
        minLines = minLines,
        onTextLayout = onTextLayout,
        style = style,
    )
}

/**
 * Text primitive supporting [AnnotatedString] with Ktheme typography and semantic colors.
 */
@Composable
fun KthemeText(
    text: AnnotatedString,
    modifier: Modifier = Modifier,
    variant: KthemeTextVariant = KthemeTextVariant.Default,
    color: Color = Color.Unspecified,
    fontSize: TextUnit = TextUnit.Unspecified,
    fontStyle: FontStyle? = null,
    fontWeight: FontWeight? = null,
    fontFamily: FontFamily? = null,
    letterSpacing: TextUnit = TextUnit.Unspecified,
    textDecoration: TextDecoration? = null,
    textAlign: TextAlign? = null,
    lineHeight: TextUnit = TextUnit.Unspecified,
    overflow: TextOverflow = TextOverflow.Clip,
    softWrap: Boolean = true,
    maxLines: Int = Int.MAX_VALUE,
    minLines: Int = 1,
    onTextLayout: (TextLayoutResult) -> Unit = {},
    style: TextStyle = LocalTextStyle.current,
) {
    val layout = KthemeComposeTheme.layout
    val colors = KthemeComposeTheme.colors

    val displayText = if (layout.contentCase == "uppercase") {
        AnnotatedString(text.text.uppercase(), text.spanStyles, text.paragraphStyles)
    } else {
        text
    }

    val resolvedColor = when {
        color != Color.Unspecified -> color
        variant == KthemeTextVariant.Primary -> colors.onCardBackground
        variant == KthemeTextVariant.Secondary || variant == KthemeTextVariant.Muted -> colors.onCardBackgroundAlt
        variant == KthemeTextVariant.Brand -> colors.brand
        variant == KthemeTextVariant.Highlight -> colors.highlight
        variant == KthemeTextVariant.Danger -> colors.danger
        style.color != Color.Unspecified -> style.color
        else -> colors.onCardBackground
    }

    Text(
        text = displayText,
        modifier = modifier,
        color = resolvedColor,
        fontSize = fontSize,
        fontStyle = fontStyle,
        fontWeight = fontWeight,
        fontFamily = fontFamily,
        letterSpacing = letterSpacing,
        textDecoration = textDecoration,
        textAlign = textAlign,
        lineHeight = lineHeight,
        overflow = overflow,
        softWrap = softWrap,
        maxLines = maxLines,
        minLines = minLines,
        onTextLayout = onTextLayout,
        style = style,
    )
}

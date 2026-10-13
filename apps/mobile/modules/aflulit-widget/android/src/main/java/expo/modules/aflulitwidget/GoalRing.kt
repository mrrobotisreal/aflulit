package expo.modules.aflulitwidget

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import androidx.core.graphics.PathParser

/**
 * T84: Today's goal rings + the graded streak flame as ONE bitmap (Glance can't
 * draw arcs). Mirrors `goal-ring-card.tsx` exactly: three concentric rings on
 * T19/T34's pitch — at Today's 132 px: radii 61 / 47 / 33, 9 px stroke, round
 * caps, `surface2` track — outer reviews (`accent`), middle reading
 * (`textMuted`), inner quest (`gold`, only on a quest day); arcs start at
 * −90°. The flame is the Ionicons `flame` glyph (the one Today draws),
 * tinted per tier, with a soft yellow halo at «all». Throws on any failure; the
 * caller falls back to a progress bar.
 */
object GoalRing {
  /** Today's ring geometry, in Today's 132-unit space. */
  private const val TODAY_SIZE = 132f
  private const val STROKE = 9f
  private val RADII = floatArrayOf(61f, 47f, 33f)

  /** Ionicons `flame` (U+F313, 512 units, y-up) — extracted from Ionicons.ttf. */
  private const val FLAME_PATH =
    "M201 414Q212 420 242 410Q286 396 326 355Q396 286 412 181Q420 131 413 97Q401 38 353 1Q296 -43 225 -29Q172 -18 136.5 22.5Q101 63 97 116Q94 143 104 172Q113 199 145 249Q158 269 165 280Q203 342 194 390Q191 402 193.5 407.0Q196 412 201 414ZM251 180Q251 180 251 180Q245 184 241 180Q239 178 236.0 169.0Q233 160 225 142Q208 105 208 80Q208 45 225 29Q237 16 256 16Q291 16 301 54Q303 63 303.0 78.0Q303 93 301 102Q295 126 280 149Q265 171 251 180Z"

  private val flame: Path by lazy { PathParser.createPathFromPathData(FLAME_PATH) }

  data class Colors(
    val track: Int,
    val reviews: Int,
    val reading: Int,
    val quest: Int,
    val flame: Int,
    val glow: Int,
  )

  fun render(rings: Rings, tier: FlameTier, sizePx: Int, colors: Colors): Bitmap {
    require(sizePx > 0) { "size" }
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val scale = sizePx / TODAY_SIZE
    val c = sizePx / 2f
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = STROKE * scale
      strokeCap = Paint.Cap.ROUND
    }
    val parts = buildList {
      add(rings.reviews to colors.reviews)
      add(rings.reading to colors.reading)
      rings.quest?.let { add(it to colors.quest) }
    }
    parts.forEachIndexed { i, (fraction, color) ->
      val r = RADII[i] * scale
      val rect = RectF(c - r, c - r, c + r, c + r)
      paint.color = colors.track
      canvas.drawArc(rect, 0f, 360f, false, paint)
      val sweep = 360f * fraction.coerceIn(0f, 1f)
      if (sweep > 0f) {
        paint.color = color
        canvas.drawArc(rect, -90f, sweep, false, paint)
      }
    }
    drawFlame(canvas, c, sizePx, rings.quest != null, tier, colors)
    return bitmap
  }

  /**
   * The flame sits a little above centre so the streak number fits under it
   * (Today: flame 18 px on a quest day, 26 px otherwise, at size 132).
   */
  private fun drawFlame(
    canvas: Canvas,
    c: Float,
    sizePx: Int,
    questDay: Boolean,
    tier: FlameTier,
    colors: Colors,
  ) {
    val scale = sizePx / TODAY_SIZE
    val flamePx = (if (questDay) 18f else 26f) * scale
    val cy = c - flamePx * 0.55f
    // Glyph space: 512 units, y-up, ink ≈ x 96..416, y −32..416 → centre (256, 192).
    val m = Matrix().apply {
      postTranslate(-256f, -192f)
      postScale(flamePx / 448f, -flamePx / 448f)
      postTranslate(c, cy)
    }
    val path = Path(flame).apply { transform(m) }
    if (tier == FlameTier.ALL) {
      // Mitch 2026-10-13: a YELLOW ring of light, clear behind the flame, so
      // the orange-red flame stands out instead of reading as a glowing sphere.
      val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = flamePx * 0.32f
        color = colors.glow
        alpha = 150
        maskFilter = BlurMaskFilter(flamePx * 0.28f, BlurMaskFilter.Blur.NORMAL)
      }
      canvas.drawCircle(c, cy, flamePx * 0.68f, glow)
    }
    val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = colors.flame
      if (tier == FlameTier.NONE) {
        style = Paint.Style.STROKE
        strokeWidth = flamePx * 0.07f
        strokeJoin = Paint.Join.ROUND
      } else {
        style = Paint.Style.FILL
      }
    }
    canvas.drawPath(path, fill)
  }
}

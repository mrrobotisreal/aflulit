package expo.modules.aflulitwidget

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.glance.currentState
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.compose.ui.unit.sp
import java.net.URLEncoder

/**
 * The Aflulit home-screen widget (Sumrak T40). Renders ONLY from the SharedPreferences
 * snapshot — never the DB. Every failure path renders the fallback, never throws.
 * Colours mirror `src/theme/colors.ts`.
 */

/** One palette per scheme, mirror of `colors.ts` (bg, surface, text, textMuted, accent). */
internal data class WidgetPalette(
  val bg: Int,
  val surface: Int,
  val text: Int,
  val textMuted: Int,
  val accent: Int,
  val border: Int,
  /** T84: Today's ring track + quest ring + the flame tiers (mirror of colors.ts). */
  val surface2: Int,
  val gold: Int,
  val flamePale: Int,
  val flameYellow: Int,
  val flameOrange: Int,
  val flameRed: Int,
  /** The all-three halo glow behind the flame (Aflulit: light blue; Sumrak's was yellow). */
  val flameHalo: Int,
) {
  companion object {
    val DARK = WidgetPalette(
      bg = 0xFF0A0A17.toInt(),
      surface = 0xFF12112A.toInt(),
      text = 0xFFE7E6F2.toInt(),
      textMuted = 0xFF9C9AB8.toInt(),
      accent = 0xFF6C63FF.toInt(),
      border = 0xFF26244A.toInt(),
      surface2 = 0xFF1A1838.toInt(),
      gold = 0xFFE2C462.toInt(),
      flamePale = 0xFFBFD8FF.toInt(),
      flameYellow = 0xFF4DB1FA.toInt(),
      flameOrange = 0xFF2457D6.toInt(),
      flameRed = 0xFF5B2EC9.toInt(),
      flameHalo = 0xFF9CE6FE.toInt(),
    )
    val LIGHT = WidgetPalette(
      bg = 0xFFF6F5FB.toInt(),
      surface = 0xFFFFFFFF.toInt(),
      text = 0xFF17162B.toInt(),
      textMuted = 0xFF5F5C78.toInt(),
      accent = 0xFF4A3CC8.toInt(),
      border = 0xFFDEDBEE.toInt(),
      surface2 = 0xFFECEAF6.toInt(),
      gold = 0xFF9E7A18.toInt(),
      flamePale = 0xFF9DBDF0.toInt(),
      flameYellow = 0xFF2E8BE0.toInt(),
      flameOrange = 0xFF1E49B8.toInt(),
      flameRed = 0xFF4A25A8.toInt(),
      flameHalo = 0xFF7CC4FF.toInt(),
    )
  }
}

internal fun paletteFor(context: Context): WidgetPalette {
  val night = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
  return if (night == Configuration.UI_MODE_NIGHT_YES) WidgetPalette.DARK else WidgetPalette.LIGHT
}

internal fun appUri(path: String, from: String? = "widget"): Uri {
  val query = if (from != null) "?from=$from" else ""
  return Uri.parse("aflulit://$path$query")
}

/**
 * A VIEW intent pinned to this app (never a chooser) — MainActivity owns the
 * `aflulit` scheme; NEW_TASK + CLEAR_TOP reuse a running task or start cold.
 */
internal fun viewIntent(context: Context, uri: Uri): Intent =
  Intent(Intent.ACTION_VIEW, uri)
    .setPackage(context.packageName)
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

/** Glance-state key the app bumps on every snapshot write, forcing a re-read. */
internal val SNAPSHOT_REV = longPreferencesKey("aflulit_snapshot_rev")

class AflulitWidget : GlanceAppWidget() {

  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val palette = paletteFor(context)
    provideContent {
      // Read the snapshot INSIDE composition, keyed on the Glance-state revision
      // the app bumps on every write (AflulitWidgetModule.refreshAll). Reading it
      // once before provideContent froze the first value for the whole Glance
      // session — update() recomposed with the stale capture (S25 finding).
      val rev = currentState(SNAPSHOT_REV) ?: 0L
      val result = remember(rev) { readSafely(context) }
      WidgetBody(context, palette, result)
    }
  }

  private fun readSafely(context: Context): SnapshotResult =
    try {
      SnapshotStore.read(context)
    } catch (e: Exception) {
      Log.w(TAG, "snapshot read failed", e)
      SnapshotResult.Corrupt
    }

  companion object {
    private const val TAG = "AflulitWidget"
  }
}

@Composable
private fun WidgetBody(context: Context, palette: WidgetPalette, result: SnapshotResult) {
  when (result) {
    is SnapshotResult.Ok -> {
      val now = System.currentTimeMillis()
      val snap = result.snapshot
      val stale = snap.isStale(now)
      Normal(context, palette, snap, stale)
    }
    else -> Placeholder(context, palette, appUri(""))
  }
}

@Composable
private fun Placeholder(context: Context, palette: WidgetPalette, uri: Uri) {
  Box(
    modifier = GlanceModifier
      .fillMaxSize()
      .background(ColorProvider(Color(palette.bg)))
      .cornerRadius(20.dp)
      .clickable(actionStartActivity(viewIntent(context, uri)))
      .padding(12.dp),
    contentAlignment = Alignment.Center,
  ) {
    Text(
      text = "Открой Сумрак",
      style = TextStyle(
        color = ColorProvider(Color(palette.text)),
        fontWeight = FontWeight.Medium,
        textAlign = TextAlign.Center,
      ),
    )
  }
}

@Composable
private fun Normal(
  context: Context,
  palette: WidgetPalette,
  snap: Snapshot,
  stale: Boolean,
) {
  val numberColor = if (stale) palette.textMuted else palette.text
  val dailyUri = appUri("review/daily")
  val readingUri = snap.continueTarget?.let {
    appUri("reader/${encode(it.packId)}/${encode(it.storyId)}")
  }
  val cardUri = readingUri ?: dailyUri

  Column(
    modifier = GlanceModifier
      .fillMaxSize()
      .background(ColorProvider(Color(palette.surface)))
      .cornerRadius(20.dp)
      .padding(12.dp)
      .clickable(actionStartActivity(viewIntent(context, cardUri))),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      Box(contentAlignment = Alignment.Center, modifier = GlanceModifier.size(RING_DP.dp)) {
        GoalRingImage(context, snap, palette)
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
          // The flame is drawn inside the bitmap (above centre); the number sits under it.
          Spacer(GlanceModifier.height(if (snap.rings.quest != null) 12.dp else 16.dp))
          Text(
            text = snap.streak.toString(),
            style = TextStyle(
              color = ColorProvider(Color(numberColor)),
              fontWeight = FontWeight.Bold,
              fontSize = if (snap.rings.quest != null) 13.sp else 16.sp,
              textAlign = TextAlign.Center,
            ),
          )
        }
      }
    }
    Spacer(GlanceModifier.height(6.dp))
    Text(
      text = "${snap.dueCount} к повторению",
      modifier = GlanceModifier.clickable(actionStartActivity(viewIntent(context, dailyUri))),
      style = TextStyle(
        color = ColorProvider(Color(numberColor)),
        fontSize = 13.sp,
        textAlign = TextAlign.Center,
      ),
    )
    if (snap.continueTarget != null) {
      Spacer(GlanceModifier.height(4.dp))
      Text(
        text = snap.continueTarget.title,
        maxLines = 1,
        style = TextStyle(
          color = ColorProvider(Color(palette.textMuted)),
          fontSize = 11.sp,
          textAlign = TextAlign.Center,
        ),
      )
    }
    if (stale) {
      Spacer(GlanceModifier.height(4.dp))
      Text(
        text = "открой приложение",
        style = TextStyle(
          color = ColorProvider(Color(palette.textMuted)),
          fontSize = 10.sp,
          textAlign = TextAlign.Center,
        ),
      )
    }
  }
}

/** Widget ring size; Today's card is 132 px, the bitmap scales its geometry. */
private const val RING_DP = 84

internal fun flameColor(tier: FlameTier, p: WidgetPalette): Int = when (tier) {
  FlameTier.NONE -> p.textMuted
  FlameTier.STARTED -> p.flamePale
  FlameTier.ONE -> p.flameYellow
  FlameTier.TWO -> p.flameOrange
  FlameTier.ALL -> p.flameRed
}

/**
 * T84: Today's three rings + the graded flame as a bitmap; falls back to a
 * Glance linear bar (the reviews ring) if the bitmap route fails.
 */
@Composable
private fun GoalRingImage(context: Context, snap: Snapshot, palette: WidgetPalette) {
  val sizePx = (RING_DP * context.resources.displayMetrics.density).toInt().coerceAtLeast(96)
  val bitmap = runCatching {
    GoalRing.render(
      rings = snap.rings,
      tier = snap.flame,
      sizePx = sizePx,
      colors = GoalRing.Colors(
        track = palette.surface2,
        reviews = palette.accent,
        reading = palette.textMuted,
        quest = palette.gold,
        flame = flameColor(snap.flame, palette),
        glow = palette.flameHalo,
      ),
    )
  }.onFailure { Log.w("AflulitWidget", "ring render failed, using bar", it) }.getOrNull()
  if (bitmap != null) {
    Image(
      provider = ImageProvider(bitmap),
      contentDescription = "Reviews ${(snap.rings.reviews * 100).toInt()}%, " +
        "reading ${(snap.rings.reading * 100).toInt()}%" +
        (snap.rings.quest?.let { ", quest ${(it * 100).toInt()}%" } ?: ""),
      modifier = GlanceModifier.size(RING_DP.dp),
    )
  } else {
    LinearProgressIndicator(
      progress = snap.rings.reviews,
      modifier = GlanceModifier.fillMaxWidth().height(6.dp),
    )
  }
}

private fun encode(s: String): String = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

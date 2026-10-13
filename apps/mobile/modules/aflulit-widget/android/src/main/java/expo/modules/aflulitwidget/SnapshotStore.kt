package expo.modules.aflulitwidget

import android.content.Context
import org.json.JSONObject

/** One outcome of reading the snapshot. Missing and Corrupt render the same placeholder but stay distinct for diagnostics. */
sealed class SnapshotResult {
  object Missing : SnapshotResult()
  object Corrupt : SnapshotResult()
  data class Ok(val snapshot: Snapshot) : SnapshotResult()
}

data class ContinueTarget(val packId: String, val storyId: String, val title: String)

/**
 * T84: Today's rings as the app computed them (`goal-rings.ts`) — outer
 * reviews, middle reading, inner quest (null on a quest-less day). The widget
 * only DRAWS these; it never recomputes, so it can't drift from Today.
 */
data class Rings(val reviews: Float, val reading: Float, val quest: Float?)

/** T84: the graded flame — none · started · one · two · all. */
enum class FlameTier { NONE, STARTED, ONE, TWO, ALL }

data class Snapshot(
  val streak: Int,
  val dueCount: Int,
  val reviewsDone: Int,
  val reviewsTarget: Int,
  val readingMinDone: Int,
  val readingMinTarget: Int,
  val goalMet: Boolean,
  val rings: Rings,
  val flame: FlameTier,
  val continueTarget: ContinueTarget?,
  val updatedAtMs: Long,
) {

  /** Mirror of widget-snapshot.ts `isStale`: strictly older than STALE_MS. */
  fun isStale(nowMs: Long): Boolean = nowMs - updatedAtMs > STALE_MS
}

/**
 * Reads and writes the SharedPreferences snapshot. Reading is DEFENSIVE by
 * design: a missing field, a mistyped value, or malformed JSON is reported as
 * [SnapshotResult.Corrupt] and never thrown, so the widget can't crash the launcher.
 */
object SnapshotStore {
  fun read(context: Context): SnapshotResult {
    val raw = context
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(KEY_SNAPSHOT, null)
    if (raw.isNullOrBlank()) return SnapshotResult.Missing
    return try {
      SnapshotResult.Ok(parse(raw))
    } catch (e: Exception) {
      SnapshotResult.Corrupt
    }
  }

  /** Commits the JSON synchronously. A blank string clears the snapshot (→ Missing). */
  fun write(context: Context, json: String) {
    val editor = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
    if (json.isBlank()) editor.remove(KEY_SNAPSHOT) else editor.putString(KEY_SNAPSHOT, json)
    editor.commit()
  }

  /** Raw stored string (debug/test only). */
  fun readRaw(context: Context): String? =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_SNAPSHOT, null)

  internal fun parse(raw: String): Snapshot {
    val o = JSONObject(raw)
    require(o.intField("v") == SNAPSHOT_VERSION) { "unsupported snapshot version" }
    val goal = o.getJSONObject("goal")
    val cont = o.get("continueReading")
    val target = when (cont) {
      JSONObject.NULL -> null
      is JSONObject -> ContinueTarget(
        packId = cont.stringField("packId"),
        storyId = cont.stringField("storyId"),
        title = cont.stringField("title"),
      )
      else -> throw IllegalArgumentException("continueReading")
    }
    return Snapshot(
      streak = o.nonNegInt("streak"),
      dueCount = o.nonNegInt("dueCount"),
      reviewsDone = goal.nonNegInt("reviewsDone"),
      reviewsTarget = goal.nonNegInt("reviewsTarget"),
      readingMinDone = goal.nonNegInt("readingMinDone"),
      readingMinTarget = goal.nonNegInt("readingMinTarget"),
      goalMet = goal.boolField("met"),
      rings = o.getJSONObject("rings").let { r ->
        Rings(
          reviews = r.fraction("reviews"),
          reading = r.fraction("reading"),
          quest = if (r.isNull("quest")) null else r.fraction("quest"),
        )
      },
      flame = when (o.stringField("flame")) {
        "none" -> FlameTier.NONE
        "started" -> FlameTier.STARTED
        "one" -> FlameTier.ONE
        "two" -> FlameTier.TWO
        "all" -> FlameTier.ALL
        else -> throw IllegalArgumentException("flame")
      },
      continueTarget = target,
      updatedAtMs = o.longField("updatedAtMs"),
    )
  }

  private fun JSONObject.intField(name: String): Int = longField(name).toInt()

  private fun JSONObject.nonNegInt(name: String): Int {
    val v = intField(name)
    require(v >= 0) { "$name negative" }
    return v
  }

  private fun JSONObject.longField(name: String): Long {
    val v = get(name)
    require(v is Int || v is Long) { "$name not an integer" }
    return (v as Number).toLong()
  }

  private fun JSONObject.fraction(name: String): Float {
    val v = get(name)
    require(v is Number) { "$name not a number" }
    val f = v.toFloat()
    require(f in 0f..1f) { "$name out of range" }
    return f
  }

  private fun JSONObject.stringField(name: String): String {
    val v = get(name)
    require(v is String) { "$name not a string" }
    return v
  }

  private fun JSONObject.boolField(name: String): Boolean {
    val v = get(name)
    require(v is Boolean) { "$name not a boolean" }
    return v
  }
}

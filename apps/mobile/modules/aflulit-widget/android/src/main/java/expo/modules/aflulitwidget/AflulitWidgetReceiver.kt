package expo.modules.aflulitwidget

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver

/** The AppWidget provider. Declared in this module's own manifest (survives `prebuild --clean`). */
class AflulitWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = AflulitWidget()
}

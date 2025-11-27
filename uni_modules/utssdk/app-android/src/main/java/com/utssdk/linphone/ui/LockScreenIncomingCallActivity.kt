package com.utssdk.linphone.ui

import android.app.KeyguardManager
import android.os.Build
import android.view.WindowManager
import com.utssdk.linphone.R

class LockScreenIncomingCallActivity : BaseIncomingCallActivity() {

    override val layoutResId: Int = R.layout.activity_lock_screen_incoming_call

    override fun configureWindow() {
        super.configureWindow()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(KeyguardManager::class.java)
            keyguardManager?.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
    }
}

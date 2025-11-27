package com.utssdk.linphone.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.utssdk.linphone.LinphoneBridge
import com.utssdk.linphone.R

abstract class BaseIncomingCallActivity : AppCompatActivity() {

    protected abstract val layoutResId: Int

    private lateinit var callerNameView: TextView
    private lateinit var callerNumberView: TextView
    private var incomingTitleView: TextView? = null
    private lateinit var answerButton: View
    private lateinit var declineButton: View

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureWindow()
        setContentView(layoutResId)
        bindViews()
        bindCallInfo(intent)
    }

    protected open fun configureWindow() {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        bindCallInfo(intent)
    }

    override fun onBackPressed() {
        LinphoneBridge.callHangup()
        super.onBackPressed()
    }

    override fun onDestroy() {
        super.onDestroy()
        CallUiController.unregisterActivity(this)
    }

    private fun bindViews() {
        callerNameView = findViewById(R.id.textCallerName)
        callerNumberView = findViewById(R.id.textCallerNumber)
        incomingTitleView = findViewById(R.id.textIncomingTitle)
        incomingTitleView?.text = getString(R.string.linphone_incoming_call_title)

        answerButton = findViewById(R.id.buttonAnswer)
        declineButton = findViewById(R.id.buttonDecline)

        answerButton.setOnClickListener {
            LinphoneBridge.callAnswer()
            finish()
        }
        declineButton.setOnClickListener {
            LinphoneBridge.callHangup()
            finish()
        }
    }

    private fun bindCallInfo(intent: Intent?) {
        val info = CallUiController.CallerInfo.fromIntent(intent)
        CallUiController.registerActivity(info?.callId, this)

        val displayName = info?.displayName?.takeIf { it.isNotBlank() }
        val number = info?.number?.takeIf { it.isNotBlank() }
        val primaryText = displayName ?: number ?: getString(R.string.linphone_incoming_call_unknown)
        callerNameView.text = primaryText

        if (number != null && number != displayName) {
            callerNumberView.visibility = View.VISIBLE
            callerNumberView.text = number
        } else {
            callerNumberView.visibility = View.GONE
        }
    }
}

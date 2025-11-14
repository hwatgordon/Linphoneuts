<script>
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { useNavigationController } from '@/composables/useNavigation'
import { bootstrapServiceState } from '@/services/utssdk'

export default {
  setup() {
    useNavigationController()

    const hydrate = (silent) => {
      bootstrapServiceState({ silent }).catch(() => {
        // ignore bootstrap errors; handled via toasts/logs
      })
    }

    onLaunch(() => {
      hydrate(false)
    })

    onShow(() => {
      hydrate(true)
    })

    hydrate(true)
  }
}
</script>

<style>
page {
  background-color: #f1f5f9;
  color: #0f172a;
  font-family: 'Helvetica Neue', Arial, sans-serif;
}

button {
  border-radius: 12rpx;
}

input {
  border-radius: 12rpx;
  border: 1px solid #cbd5f5;
  padding: 16rpx 20rpx;
}
</style>

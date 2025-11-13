<script>
import { useNavigationController } from '@/composables/useNavigation'

export default {
  setup() {
    useNavigationController()
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

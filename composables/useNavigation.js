import { watch } from 'vue'
import { useAppState, consumeRequestedRoute, resolveRoute, setCurrentRoute, ROUTES } from '@/store/appState'

function performNavigation(targetRoute, replace = false) {
  const url = resolveRoute(targetRoute)
  if (!url) {
    return
  }

  const complete = () => {
    setCurrentRoute(url)
  }

  const fallbackToReLaunch = () => {
    uni.reLaunch({
      url,
      complete
    })
  }

  if (replace) {
    uni.redirectTo({
      url,
      success: complete,
      fail: fallbackToReLaunch
    })
    return
  }

  if (url === ROUTES.launcher) {
    uni.reLaunch({
      url,
      complete
    })
    return
  }

  uni.navigateTo({
    url,
    success: complete,
    fail: fallbackToReLaunch
  })
}

export function useNavigationController() {
  const state = useAppState()

  watch(
    () => state.navigation.requestedRoute,
    () => {
      const { route, replace } = consumeRequestedRoute()
      if (!route) {
        return
      }
      performNavigation(route, replace)
    }
  )
}

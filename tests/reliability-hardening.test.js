const assert = require('assert')
const fs = require('fs')
const path = require('path')

const read = file => fs.readFileSync(file, 'utf8')

const orderCloud = read('cloudfunctions/order/index.js')
const orderPage = read('pages/diancan/diancan.js')
assert(orderCloud.includes('buildOrderId(openid, requestId)'))
assert(orderCloud.includes("transaction.collection('orders').doc(orderId)"))
assert(orderPage.includes('submittingOrder: false'))
assert(orderPage.includes('_pendingOrderRequestId'))

const cartCloud = read('cloudfunctions/cart/index.js')
const cartClient = read('utils/cartManager.js')
assert(cartCloud.includes('buildCartId(openid)'))
assert(cartCloud.includes('deletedKeys'))
assert(cartCloud.includes('mergeCart('))
assert(cartClient.includes('updatedAt'))
assert(cartClient.includes('deletedKeys'))

const wishCloud = read('cloudfunctions/wish/index.js')
const wishPage = read('pages/wish-list/wish-list.js')
const wishView = read('pages/wish-list/wish-list.wxml')
assert(wishCloud.includes("case 'delete':"))
assert(wishCloud.includes("wish.status !== 'cancelled'"))
assert(wishCloud.includes('wish.creatorId === openid'))
assert(wishCloud.includes('wish.assigneeId === openid'))
assert(wishCloud.includes('removeWishFromOwnerCarts'))
assert(wishCloud.includes("type: 'wish_received'"))
assert(wishCloud.includes("type: 'wish_status'"))
assert(wishPage.includes('cartManager.removeFromCart(`wish:${wishId}`)'))
assert(wishPage.includes("action: 'markWishRead'"))
assert(wishView.includes("item.status === 'cancelled'"))
assert(wishPage.includes('onWishTouchMove'))
assert(wishView.includes('class="wish-delete-action"'))
assert(wishView.includes('item.status === \'in_cart\''))
assert(wishView.includes('去饭篮'))
assert(!wishView.includes('去安排'))

const favoriteCloud = read('cloudfunctions/favorite/index.js')
assert(favoriteCloud.includes('buildFavoriteId(userId, recipeId)'))
assert(favoriteCloud.includes("transaction.collection('favorites').doc(favoriteId)"))

const notificationCloud = read('cloudfunctions/notification/index.js')
const notificationPage = read('pages/notifications/notifications.js')
assert(notificationCloud.includes("skip((page - 1) * limit)"))
assert(notificationCloud.includes('unreadCount: unreadResult.total'))
assert(notificationPage.includes('onReachBottom()'))
assert(notificationPage.includes('previousUnreadCount'))

const recipeCloud = read('cloudfunctions/recipe/index.js')
assert(recipeCloud.includes("status: 'published'"))
assert(recipeCloud.includes('await deleteCloudFiles(fileIDs)'))
assert(recipeCloud.includes('while (hasMore)'))
assert(recipeCloud.includes("Number.isFinite(timeValue)"))

const appConfig = JSON.parse(read('app.json'))
assert.strictEqual(appConfig.usingComponents['cloud-image'], '/components/cloud-image/cloud-image')
assert.strictEqual(appConfig.lazyCodeLoading, 'requiredComponents')

const appSource = read('app.js')
assert(appSource.includes('excludeIds: Object.keys(this._shownNotificationIds || {})'))
assert(appSource.includes('continuePopupQueue'))
assert(appSource.includes("modalRes.action === 'acknowledged'"))

const adminUsersPage = read('pages/admin-users/admin-users.js')
const adminUsersView = read('pages/admin-users/admin-users.wxml')
assert(adminUsersPage.includes('onCopySearchCode'))
assert(adminUsersPage.includes('wx.setClipboardData'))
assert(adminUsersView.includes('catchlongpress="onCopySearchCode"'))

const collectWxml = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(directory, entry.name)
  if (entry.isDirectory()) return collectWxml(target)
  return entry.name.endsWith('.wxml') ? [target] : []
})
collectWxml('pages').concat(collectWxml('components')).forEach(file => {
  if (file.endsWith(path.join('components', 'cloud-image', 'cloud-image.wxml'))) return
  const dynamicImages = read(file).match(/<image[^>]*src="\{\{[^>]*>/g) || []
  dynamicImages.forEach(tag => {
    assert(/binderror=/.test(tag), `${file} 仍有未接管的动态图片`)
  })
})

const adminSources = [
  'app.js',
  ...fs.readdirSync('cloudfunctions', { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join('cloudfunctions', entry.name, 'index.js'))
    .filter(fs.existsSync)
].map(read).join('\n')
assert(!adminSources.includes('oyWDkxVwYIHb3adMU4PpCl9rWUqI'))

console.log('reliability hardening: pass')

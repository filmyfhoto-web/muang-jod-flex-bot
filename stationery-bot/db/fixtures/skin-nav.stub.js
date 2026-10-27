/* Test stand-in for the navigation of the live "skin" module (seq 20, enabled in production): the module rebuilds the side menu from
   a fixed list and the bottom bar from its own fixed list (MOBNAV, kept to the routes that exist). The real module is not copied
   here; this keeps the same behaviour so the overview's links are tested the way they are built on the live back office. */
(function(){
  const SIDE = ['home', 'pos', 'docs', 'stock', 'settings']
  const MOBNAV = [
    { r: 'home', t: 'แดชบอร์ด', ic: '🏠' },
    { r: 'docs', t: 'เอกสาร', ic: '🧾' },
    { r: 'pos', t: 'POS', ic: '🛒' },
    { r: 'stock', t: 'สต็อก', ic: '📦' },
    { r: 'menu', t: 'เพิ่มเติม', ic: '⋯' },
  ]
  buildNav = function () {
    const nav = document.getElementById('nav')
    nav.innerHTML = ''
    SIDE.filter((id) => ROUTES.some((r) => r.id === id)).forEach((id) => {
      const r = ROUTES.find((x) => x.id === id)
      const a = document.createElement('a')
      a.dataset.r = id
      a.innerHTML = `<span class="ic">${r.ic}</span><span>${r.name}</span>`
      a.onclick = () => go(id)
      nav.appendChild(a)
    })
    const mn = document.getElementById('mobnav')
    mn.innerHTML = ''
    MOBNAV.filter((i) => ROUTES.some((r) => r.id === i.r)).forEach((i) => {
      const a = document.createElement('a')
      a.dataset.r = i.r
      a.innerHTML = `<span class="ic">${i.ic}</span><span>${i.t}</span>`
      a.onclick = () => go(i.r)
      mn.appendChild(a)
    })
  }
})()

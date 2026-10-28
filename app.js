/* 骏河屋 <<東方>> 新入荷 · 浏览前端（原生 JS，无依赖） */
(() => {
  const PAGE = 60;
  const $ = (s) => document.querySelector(s);
  const state = {
    set: 'baseline', offset: 0, total: 0, summary: null, daily: [], ver: '',
    cats: [],            // 已选分类（多选）
    allCats: [],         // 全部分类 [{name,count}]
    catFilter: '',       // 分类面板内的搜索词
    imgBase: '/images',  // 图片根：本地 /images；云端 https://surugaya.flan.uno
    mode: null,          // null=未定 / 'static'=纯静态托管（云端无后端）
    hasBaseline: true,   // 云端版没有首批快照，只有每日上新
  };

  const yen = (v) => v == null ? null : '¥' + Number(v).toLocaleString('ja-JP');
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  // 图片带了长缓存，数据重建后必须让 URL 变化，否则浏览器一直用旧图
  const imgUrl = (rel) => {
    const p = String(rel == null ? '' : rel).replace(/^\.\.\/data\/images\//, '');
    return state.imgBase.replace(/\/$/, '') + '/' + p + (state.ver ? '?v=' + state.ver : '');
  };

  const staticMode = () => {
    if (state.mode !== 'static') state.mode = 'static';
    return null;
  };

  async function api(path, params) {
    // 构建时注入的标记优先（build_cloud.py 会在 index.html 里写这个变量）
    if (window.__SURUGAYA_STATIC__ === true) return staticApi(path, params || {});
    if (state.mode === 'static') return staticApi(path, params || {});
    const u = new URL(path, location.origin);
    Object.entries(params || {}).forEach(([k, v]) => { if (v !== '' && v != null) u.searchParams.set(k, v); });
    let r;
    try {
      r = await fetch(u);
    } catch (e) {
      staticMode();                          // 网络层失败 → 切静态
      return staticApi(path, params || {});
    }
    if (r.status === 404) {
      staticMode();                          // 纯静态托管的 404
      return staticApi(path, params || {});
    }
    // ⚠️ CF Pages 对不存在的路径**不做 404**，而是回退返回 index.html（200 + text/html）。
    //    只判断 status 会漏，必须看 Content-Type 是不是 JSON，否则 r.json() 解析 HTML 直接抛错。
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) {
      staticMode();
      return staticApi(path, params || {});
    }
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  /* ---------- 静态模式：云端 CF Pages 没有后端，数据直接从 /data/*.json(l) 拉 ----------
     两天数据约 1.2MB，浏览器内筛选绰绰有余（本地版仍走 Python API） */
  const S = { cache: {}, summary: null };

  async function staticSet(name) {
    if (S.cache[name]) return S.cache[name];
    const r = await fetch('/data/' + name + '.jsonl');
    if (!r.ok) throw new Error('数据集加载失败: ' + name);
    const rows = (await r.text()).split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
    S.cache[name] = rows;
    return rows;
  }

  function staticFilters(rows, p) {
    let out = rows;
    const kw = (p.q || '').trim().toLowerCase();
    if (kw) out = out.filter(r => ((r.name || '') + ' ' + (r.title || '') + ' ' + (r.note || '') +
      ' ' + (r.brand || '') + ' ' + (r.maker || '') + ' ' + (r.category_full || '') + ' ' + r.id)
      .toLowerCase().includes(kw));
    const cats = (p.cats || '').split(',').map(s => s.trim()).filter(Boolean);
    // 「(未分类)」必须精确匹配 —— 空字符串永远 startswith 不到它
    const catMatch = (r, w) => {
      const c = r.cat || '(未分类)';
      return w === '(未分类)' ? c === w : c.startsWith(w);
    };
    if (cats.length) out = out.filter(r => cats.some(c => catMatch(r, c)));
    if (p.nomismatch === 1 || p.nomismatch === '1') out = out.filter(r => !r.is_mismatch);
    if (p.withimg === 1 || p.withimg === '1') out = out.filter(r => r.imgs && r.imgs.thumb);
    const st = p.stock || '';
    if (st === 'buyable') out = out.filter(r => r.buyable === true);
    else if (st === 'instock') out = out.filter(r => r.stock_state === 'in');
    else if (st === 'branch') out = out.filter(r => r.stock_state === 'branch');
    else if (st === 'none') out = out.filter(r => r.stock_state === 'none');
    const pmin = parseInt(p.pmin, 10), pmax = parseInt(p.pmax, 10);
    if (!isNaN(pmin)) out = out.filter(r => (r.price || 0) >= pmin);
    if (!isNaN(pmax)) out = out.filter(r => (r.price || 0) <= pmax);
    const sort = p.sort || 'default';
    if (sort === 'price_asc') out = out.slice().sort((a, b) => (a.price || 1e9) - (b.price || 1e9));
    else if (sort === 'price_desc') out = out.slice().sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sort === 'date_desc') out = out.slice().sort((a, b) => String(b.release_date || '').localeCompare(String(a.release_date || '')));
    else if (sort === 'branch_desc') out = out.slice().sort((a, b) => (b.store_count || 0) - (a.store_count || 0));
    else if (sort === 'store_price_asc') out = out.slice().sort((a, b) => (a.min_price || 1e9) - (b.min_price || 1e9));
    return out;
  }

  async function staticApi(path, p) {
    if (path === '/api/summary') {
      if (!S.summary) S.summary = await (await fetch('/data/summary.json')).json();
      return S.summary;
    }
    const rows = await staticSet(p.set || '');
    if (path === '/api/categories') {
      const m = new Map();
      rows.forEach(r => { const c = r.cat || '(未分类)'; m.set(c, (m.get(c) || 0) + 1); });
      return [...m.entries()].map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    }
    if (path === '/api/items') {
      const f = staticFilters(rows, p);
      const off = parseInt(p.offset, 10) || 0;
      const lim = Math.min(parseInt(p.limit, 10) || 60, 500);
      return { total: f.length, offset: off, items: f.slice(off, off + lim) };
    }
    throw new Error('静态模式不支持的接口: ' + path);
  }

  /* ---------------- 顶部概览 ---------------- */
  async function loadSummary() {
    const s = await api('/api/summary');
    state.summary = s;
    state.daily = s.daily || [];
    state.ver = String(s.generated_at || '').replace(/\D/g, '');
    if (s.image_base) state.imgBase = s.image_base;
    state.hasBaseline = !!(s.baseline && s.baseline.count > 0);

    const parts = [];
    if (state.hasBaseline) parts.push(`首日快照 ${s.baseline.count.toLocaleString()} 件`);
    parts.push(`每日上新 ` + state.daily.map(d => `${d.date.slice(5)} ${d.count} 件`).join(' / '));
    parts.push(`数据生成于 ${s.generated_at}`);
    $('#subtitle').textContent = parts.join(' · ');

    const statBlocks = [];
    if (state.hasBaseline) statBlocks.push(`<div><b>${s.baseline.count.toLocaleString()}</b><span>首批快照</span></div>`);
    statBlocks.push(`<div><b>${state.daily.reduce((a, d) => a + d.count, 0).toLocaleString()}</b><span>累计上新</span></div>`);
    statBlocks.push(`<div><b>${state.daily.length}</b><span>有上新天数</span></div>`);
    $('#topstats').innerHTML = statBlocks.join('');

    // 打开网页默认落在最近一天（云端没有 baseline，不能停在 'baseline'）。
    // 只在首次加载时设，避免用户切到别的日期后又被拽回来。
    if (!state.hasBaseline && state.daily.length && !state._setInit) {
      state.set = 'daily/' + state.daily[state.daily.length - 1].date;
      state._setInit = true;
    }
    renderTabs();
    if (!state._tabsBound) { bindTabs(); state._tabsBound = true; }
  }

  // 「最近 8 天 + 更早浮层」的 tab 渲染。切换日期后要重新调用，
  // 否则切到「更早」里的日期时，顶栏看不出当前在看哪天。
  function renderTabs() {
    const s = state.summary || {};
    const RECENT_N = 8;
    const recent = state.daily.slice(-RECENT_N);
    const older = state.daily.slice(0, -RECENT_N);
    const curDate = (state.set || '').replace('daily/', '');
    const curInOlder = older.find(d => d.date === curDate);

    const tabs = [];
    if (state.hasBaseline) {
      tabs.push(`<button data-set="baseline" class="${state.set === 'baseline' ? 'on' : ''}">首批快照<span class="n">${(s.baseline && s.baseline.count || 0).toLocaleString()}</span></button>`);
    }
    // 从新到旧：最左边是最近一天
    if (curInOlder) {
      tabs.push(`<button data-set="daily/${curInOlder.date}" class="on">${curInOlder.date}` +
        `<span class="n">${curInOlder.count.toLocaleString()} 件上新</span></button>`);
    }
    recent.slice().reverse().forEach((d) => tabs.push(
      `<button data-set="daily/${d.date}" class="${state.set === 'daily/' + d.date ? 'on' : ''}">` +
      `${d.date.slice(5)}<span class="n">${d.count.toLocaleString()} 件上新</span></button>`));
    if (older.length) {
      tabs.push(`<button id="olderBtn" class="${curInOlder ? 'on' : ''}">更早` +
        `<span class="n">${older.length} 天</span></button>`);
    }
    const scrollTop = window.scrollY;
    $('#tabs').innerHTML = tabs.join('') +
      (older.length ? `<div class="olderpop" id="olderPop" hidden>` +
        older.slice().reverse().map(d => `<button data-set="daily/${d.date}">${d.date}` +
          `<span class="n">${d.count} 件</span></button>`).join('') + `</div>` : '');
    window.scrollTo(0, scrollTop);
  }

  function bindTabs() {
    $('#tabs').addEventListener('click', (e) => {
      if (e.target.closest('#olderBtn')) {
        const pop = $('#olderPop');
        if (pop) pop.hidden = !pop.hidden;
        e.stopPropagation();
        return;
      }
      const b = e.target.closest('button[data-set]');
      if (!b) return;
      const pop = $('#olderPop');
      if (pop) pop.hidden = true;
      state.set = b.dataset.set; state.offset = 0;
      state.cats = []; updateCatBtn();
      renderTabs();          // 关键：重渲染，让「更早」里的日期也显示在当前行
      loadCategories(); load();
    });
    // 点空白处收起浮层
    document.addEventListener('click', (e) => {
      const pop = $('#olderPop');
      if (pop && !pop.hidden && !e.target.closest('#tabs')) pop.hidden = true;
    }, { passive: true });
  }

  /* ---------------- 分类多选 ---------------- */
  async function loadCategories() {
    state.allCats = await api('/api/categories', { set: state.set });
    // 已选分类在本数据集里可能不存在了 → 清掉
    const names = new Set(state.allCats.map(c => c.name));
    state.cats = state.cats.filter(c => names.has(c));
    renderCatList(); updateCatBtn();
  }

  function renderCatList() {
    const kw = state.catFilter.trim().toLowerCase();
    const list = state.allCats.filter(c => !kw || c.name.toLowerCase().includes(kw));
    if (!list.length) { $('#catList').innerHTML = '<div class="catempty">没有匹配的分类</div>'; return; }
    $('#catList').innerHTML = list.map(c => `
      <label class="catitem">
        <input type="checkbox" value="${esc(c.name)}" ${state.cats.includes(c.name) ? 'checked' : ''}>
        <span class="nm">${esc(c.name)}</span>
        <span class="ct">${c.count.toLocaleString()}</span>
      </label>`).join('');
  }

  function updateCatBtn() {
    const btn = $('#catBtn');
    const n = state.cats.length;
    if (!n) { btn.textContent = '分类：全部 ▾'; btn.classList.remove('active'); }
    else if (n === 1) { btn.textContent = `分类：${state.cats[0]} ▾`; btn.classList.add('active'); }
    else { btn.textContent = `分类：已选 ${n} 项 ▾`; btn.classList.add('active'); }
    $('#catSummary').textContent = n ? `已选 ${n} 项` : '未选择';
  }

  function initCatPanel() {
    const panel = $('#catpanel'), btn = $('#catBtn');
    btn.addEventListener('click', (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; });
    panel.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => { panel.hidden = true; });
    $('#catClose').addEventListener('click', () => { panel.hidden = true; });
    $('#catSearch').addEventListener('input', (e) => { state.catFilter = e.target.value; renderCatList(); });

    $('#catList').addEventListener('change', (e) => {
      const cb = e.target.closest('input[type=checkbox]');
      if (!cb) return;
      const v = cb.value;
      if (cb.checked) { if (!state.cats.includes(v)) state.cats.push(v); }
      else { state.cats = state.cats.filter(x => x !== v); }
      updateCatBtn(); reload();
    });

    $('#catAll').addEventListener('click', () => {
      // 全选：选中当前搜索过滤后的全部（没搜索词就是全部）
      const kw = state.catFilter.trim().toLowerCase();
      const list = state.allCats.filter(c => !kw || c.name.toLowerCase().includes(kw));
      const set = new Set(state.cats);
      list.forEach(c => set.add(c.name));
      state.cats = [...set]; renderCatList(); updateCatBtn(); reload();
    });
    $('#catNone').addEventListener('click', () => {
      const kw = state.catFilter.trim().toLowerCase();
      if (!kw) { state.cats = []; }
      else {
        const hit = new Set(state.allCats
          .filter(c => c.name.toLowerCase().includes(kw)).map(c => c.name));
        state.cats = state.cats.filter(c => !hit.has(c));
      }
      renderCatList(); updateCatBtn(); reload();
    });
  }

  /* ---------------- 列表 ---------------- */
  function params(extra) {
    // 已选分类数 == 全部分类数时视为「不过滤」：162 个分类拼进 query string
    // 会超出 URL 长度上限被截断（实测全选只返回 7,096 而非 7,146）
    const cats = (state.cats.length && state.cats.length < state.allCats.length)
      ? state.cats.join(',') : '';
    return Object.assign({
      set: state.set, offset: state.offset, limit: PAGE,
      q: $('#q').value.trim(), cats: cats, sort: $('#sort').value,
      stock: $('#stockfilter').value,
      pmin: $('#pmin').value, pmax: $('#pmax').value,
      withimg: $('#withimg').checked ? 1 : '',
      nomismatch: $('#nomismatch').checked ? 1 : '',
    }, extra || {});
  }

  async function load() {
    $('#grid').innerHTML = '<div class="empty-state">加载中…</div>';
    const d = await api('/api/items', params());
    state.total = d.total;
    const from = d.total ? d.offset + 1 : 0;
    const to = Math.min(d.offset + PAGE, d.total);
    $('#resultbar').innerHTML = `共 <b>${d.total.toLocaleString()}</b> 件` +
      (d.total ? `，显示第 <b>${from}–${to}</b> 件` : '') +
      (state.cats.length ? `　·　分类筛选：${state.cats.length} 项` : '');
    render(d.items);
    renderPager();
  }

  // 库存状态：本店有货 / 仅分店有货 / 全渠道无货 / 未抓
  // （分店价格不放在这里，卡片的价格位已经显示最低价「¥xxx起」）
  // 库存状态统一用后端算好的 stock_state，**不要**用 r.stock ——
  // stock 是详情页字段，全量快照没抓详情时全是 null，会把「本店有货」误显示成无货。
  function stockInfo(r) {
    const st = r.stock_state;
    if (st === 'in') return { cls: 'in', text: r.stock > 0 ? `本店有货 ${r.stock}` : '本店有货' };
    if (st === 'branch') return { cls: 'branch', text: `分店${r.store_count}家有货` };
    if (st === 'none') return { cls: 'none', text: '全渠道无货' };
    return null;   // unknown（没抓过分店）不显示徽标
  }
  const pricesSpread = (r) => r.min_price && r.max_price && r.min_price !== r.max_price;

  function cardHtml(r) {
    const th = r.imgs && r.imgs.thumb;
    const flags = [];
    if (r.is_mismatch) flags.push('<span class="flag">疑似误匹配</span>');
    else if (r.is_touhou) flags.push('<span class="flag touhou">東方Project</span>');
    // 发售日早于 18 个月 → 大概率是索引回归的老货，不是新上架（列表页 badges 全是「新入荷」，没区分度）
    if (r.is_recent === false) flags.push('<span class="flag old">旧货</span>');
    (r.badges || []).slice(0, 1).forEach(b => flags.push(`<span class="flag new">${esc(b)}</span>`));
    const si = stockInfo(r);
    if (si && si.cls === 'branch') flags.push('<span class="flag branch">分店有货</span>');
    if (si && si.cls === 'none') flags.push('<span class="flag out">全渠道无货</span>');
    // 本店无货时，价格位显示分店最低价
    let price;
    if (r.price != null) {
      price = `<span class="cur">¥</span>${Number(r.price).toLocaleString('ja-JP')}`;
    } else if (r.min_price) {
      price = `<span class="cur">¥</span>${Number(r.min_price).toLocaleString('ja-JP')}`
        + `<span class="sub">起</span>`;
    } else {
      price = `<span class="none">${r.sold_out ? '本店品切れ' : '无在库价'}</span>`;
    }
    return `<article class="card" data-id="${esc(r.id)}">
      <div class="thumb">${th ? `<img loading="lazy" src="${esc(imgUrl(th))}" alt="">`
        : '<div class="noimg">无图片</div>'}<div class="flagline">${flags.join('')}</div></div>
      <div class="body">
        <div class="nm" title="${esc(r.name)}">${esc(r.name)}</div>
        <div class="price">${price}</div>
        <div class="cat" title="${esc(r.category_full || r.category || '')}">${esc(r.cat || '')}</div>
        <div class="meta"><span>${esc(r.release_date || '')}</span>
          <span class="${si ? 'stk ' + si.cls : ''}">${si ? esc(si.text) : ''}</span></div>
      </div></article>`;
  }

  function render(items) {
    if (!items.length) { $('#grid').innerHTML = '<div class="empty-state">没有符合条件的商品</div>'; return; }
    $('#grid').innerHTML = items.map(cardHtml).join('');
  }

  function renderPager() {
    const pages = Math.ceil(state.total / PAGE);
    const cur = Math.floor(state.offset / PAGE) + 1;
    if (pages <= 1) { $('#pager').innerHTML = ''; return; }
    const list = new Set([1, 2, pages - 1, pages, cur, cur - 1, cur + 1, cur - 2, cur + 2]);
    const nums = [...list].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
    let html = `<button data-p="${cur - 1}" ${cur === 1 ? 'disabled' : ''}>上一页</button>`;
    let prev = 0;
    for (const n of nums) {
      if (prev && n - prev > 1) html += '<span class="ell">…</span>';
      html += `<button data-p="${n}" class="${n === cur ? 'on' : ''}">${n}</button>`;
      prev = n;
    }
    html += `<button data-p="${cur + 1}" ${cur === pages ? 'disabled' : ''}>下一页</button>`;
    $('#pager').innerHTML = html;
    $('#pager').onclick = (e) => {
      const b = e.target.closest('button[data-p]');
      if (!b || b.disabled) return;
      state.offset = (parseInt(b.dataset.p, 10) - 1) * PAGE;
      load(); window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }

  /* ---------------- 详情弹窗 ---------------- */
  const cache = new Map();
  async function openModal(id) {
    $('#modal').hidden = false;
    $('#m-img').innerHTML = '<div style="color:#9aa3ad">加载中…</div>';
    $('#m-info').innerHTML = '';
    let r = cache.get(id);
    if (!r) {
      const d = await api('/api/items', { set: state.set, q: id, offset: 0, limit: 5 });
      r = (d.items || []).find(x => x.id === id);
      if (r) cache.set(id, r);
    }
    if (!r) { $('#m-img').innerHTML = ''; $('#m-info').innerHTML = '<p>未找到该商品</p>'; return; }
    const big = (r.imgs && (r.imgs.big || r.imgs.thumb)) || null;
    $('#m-img').innerHTML = big
      ? `<img src="${esc(imgUrl(big))}" alt="">`
      : '<div style="color:#9aa3ad;padding:40px 0">该商品站点无图</div>';

    const si = stockInfo(r);
    const kv = [
      ['售价', r.price != null ? `<span class="price">${yen(r.price)}</span>` : '— ' + (r.sold_out ? '(本店品切れ)' : '')],
      ['在库', si ? `<span class="stk ${si.cls}">${esc(si.text)}</span>` : '—'],
      ['分店价', pricesSpread(r)
        ? `<b>${yen(r.min_price)}</b> ～ ${yen(r.max_price)}` +
          `<span style="color:#9aa3ad;font-size:11px">（${r.stores.filter(s => s.price).length} 家有价）</span>`
        : (r.min_price ? yen(r.min_price) : '—')],
      ['定価', r.list_price ? yen(r.list_price) : '—'],
      ['状态', r.condition || '—'],
      ['分类', r.cat || '—'],
      ['厂商', r.maker || r.brand || '—'],
      ['发售日', (r.release_date || '—') +
        (r.is_recent === false ? '<span style="color:#9aa3ad;font-size:11px">（较早，可能是索引回归的老货）</span>' : '')],
      ['マケプレ', r.makeple_price ? yen(r.makeple_price) : '—'],
    ];

    let storeHtml = '';
    if (r.stores && r.stores.length) {
      const withPrice = r.stores.filter(s => s.price);
      const cheapest = r.min_price;
      const rows = r.stores.map(s => {
        const isCheap = s.price && cheapest && s.price === cheapest && pricesSpread(r);
        return `<tr class="${isCheap ? 'cheap' : ''}">
          <td>${s.url
            ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`
            : esc(s.name)}
            ${isCheap ? ' <span class="best">最低价</span>' : ''}
            ${s.address ? `<div class="addr">${esc(s.address)}</div>` : ''}</td>
          <td class="num">${esc(String(s.stock == null ? '-' : s.stock))}</td>
          <td class="num pricecol">${s.price ? yen(s.price) : '<span class="np">无价</span>'}</td>
        </tr>`;
      }).join('');
      storeHtml = `<div class="sechead">分店库存与售价（${r.store_count} 家${withPrice.length ? `，${withPrice.length} 家有价` : ''}）</div>
        <table class="storetbl"><thead><tr><th>店铺</th><th class="num">在庫</th><th class="num">售价</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <div class="storenone">同一商品在各实体店售价不同（实测同款差过 3 倍）。价格取自各店视角的商品页；标注「无价」的是该店页面当前未显示在库价格，可能已被订走。</div>`;
    } else if (r.store_count === 0) {
      storeHtml = `<div class="sechead">分店库存</div>
        <div class="storenone">全部实体店均无库存。</div>`;
    }

    $('#m-info').innerHTML = `
      <h2>${esc(r.name)}</h2>
      <div class="id">番号 ${esc(r.id)}${r.title && r.title !== r.name ? ' · ' + esc(r.title) : ''}</div>
      <dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      ${storeHtml}
      <div class="sechead">備考</div>
      <div class="note ${r.note ? '' : 'empty'}">${r.note ? esc(r.note) : '（无備考）'}</div>
      <div class="actions">
        ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">在骏河屋打开 ↗</a>` : ''}
        <a class="ghost" href="https://www.suruga-ya.jp/search?category=&search_word=${encodeURIComponent(r.name || '')}"
           target="_blank" rel="noopener">按名称搜同类</a>
      </div>`;
  }

  /* ---------------- 事件绑定 ---------------- */
  let timer = null;
  const debounce = (fn, ms) => (...a) => { clearTimeout(timer); timer = setTimeout(() => fn(...a), ms); };
  const reload = () => { state.offset = 0; load(); };

  $('#grid').addEventListener('click', (e) => {
    const c = e.target.closest('.card');
    if (c) openModal(c.dataset.id);
  });
  $('#modal').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) $('#modal').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#modal').hidden = true; });

  $('#q').addEventListener('input', debounce(reload, 280));
  ['#sort', '#stockfilter', '#pmin', '#pmax'].forEach(s => $(s).addEventListener('change', reload));
  $('#withimg').addEventListener('change', reload);
  $('#nomismatch').addEventListener('change', reload);
  $('#reset').addEventListener('click', () => {
    $('#q').value = ''; $('#sort').value = 'default'; $('#stockfilter').value = '';
    $('#pmin').value = ''; $('#pmax').value = '';
    $('#withimg').checked = false; $('#nomismatch').checked = true;
    state.cats = []; state.catFilter = ''; $('#catSearch').value = '';
    renderCatList(); updateCatBtn(); reload();
  });

  (async () => {
    await loadSummary();
    initCatPanel();
    await loadCategories();
    await load();
  })();
})();

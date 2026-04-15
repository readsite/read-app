export const API_BASE = 'https://solitudenook.top'

export async function fetchDatesList(forceRefresh = false) {
  try {
    const response = await fetch(`${API_BASE}/api/dates`, { cache: forceRefresh ? 'no-store' : 'default' })
    if (!response.ok) throw new Error('获取日期列表失败')
    const dates = await response.json()
    return Array.isArray(dates) ? dates : []
  } catch (err) {
    console.warn('获取日期列表失败', err)
    return []
  }
}

export async function fetchPostData(date) {
  const response = await fetch(`${API_BASE}/api/posts/${date}`)
  if (!response.ok) throw new Error('No data')
  return await response.json()
}

export async function updateFavorite(date, type, delta) {
  const response = await fetch(`${API_BASE}/api/posts/${date}/stats/${type}/favorite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta })
  })
  if (!response.ok) throw new Error('更新失败')
  return await response.json()
}

export async function updateShare(date, type, delta = 1) {
  const response = await fetch(`${API_BASE}/api/posts/${date}/stats/${type}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta })
  })
  if (!response.ok) throw new Error('更新失败')
  return await response.json()
}

export async function fetchComments(date, type) {
  const response = await fetch(`${API_BASE}/api/comments?date=${date}&type=${type}`)
  if (!response.ok) throw new Error('加载评论失败')
  return await response.json()
}

export async function submitComment(date, type, nickname, content, ownerToken) {
  const response = await fetch(`${API_BASE}/api/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, type, nickname, content, owner_token: ownerToken })
  })
  if (!response.ok) throw new Error('提交失败')
  return await response.json()
}

export async function deleteComment(commentId, ownerToken) {
  const response = await fetch(`${API_BASE}/api/comments/${commentId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner_token: ownerToken })
  })
  if (!response.ok) throw new Error('删除失败')
  return await response.json()
}

export async function fetchCommentsCount(date, type) {
  const response = await fetch(`${API_BASE}/api/comments/count?date=${date}&type=${type}`)
  if (!response.ok) throw new Error('获取评论数失败')
  return await response.json()
}
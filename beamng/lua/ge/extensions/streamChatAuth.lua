local M = {}

local allowedPaths = {
  ["/api/v1/auth/twitch/device"] = true,
  ["/api/v1/auth/twitch/poll"] = true,
  ["/api/v1/auth/twitch/open"] = true,
  ["/api/v1/auth/twitch/forget"] = true,
  ["/api/v1/chat/twitch/connect"] = true,
  ["/api/v1/chat/events"] = true
}

function M.request(path, payload)
  if not allowedPaths[path] then
    return {error = "Unsupported Stream Chat helper request"}
  end

  local okHttp, http = pcall(require, "socket.http")
  local okLtn12, ltn12 = pcall(require, "ltn12")
  if not okHttp or not okLtn12 then
    return {error = "BeamNG's local HTTP support is unavailable"}
  end

  local ipc = jsonReadFile("/settings/BeamNGStreamChat/ipc.json")
  if type(ipc) ~= "table" or type(ipc.key) ~= "string" or not string.match(ipc.key, "^[%w_-]+$") or #ipc.key ~= 43 then
    return {error = "Stream Chat installation key is missing; run the Stream Chat installer again"}
  end

  local body = jsonEncode(payload or {})
  local responseParts = {}
  http.TIMEOUT = 10
  local ok, statusCode = http.request({
    url = "http://127.0.0.1:8765" .. path,
    method = "POST",
    headers = {
      ["Content-Type"] = "application/json",
      ["Content-Length"] = tostring(#body),
      ["X-Stream-Chat-Key"] = ipc.key
    },
    source = ltn12.source.string(body),
    sink = ltn12.sink.table(responseParts)
  })

  if not ok then
    return {error = "The Stream Chat background service is not running"}
  end

  local responseBody = table.concat(responseParts)
  local decodedOk, decoded = pcall(jsonDecode, responseBody)
  if not decodedOk or type(decoded) ~= "table" then
    return {error = "The local Stream Chat helper returned an invalid response"}
  end
  decoded.httpStatus = tonumber(statusCode)
  return decoded
end

return M

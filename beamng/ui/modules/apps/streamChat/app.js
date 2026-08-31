(function ensureStreamChatStyles() {
  if (document.getElementById('stream-chat-styles')) return;
  var link = document.createElement('link');
  link.id = 'stream-chat-styles';
  link.rel = 'stylesheet';
  link.href = '/ui/modules/apps/streamChat/app.css';
  document.head.appendChild(link);
}());

angular.module('beamng.apps').directive('streamChat', ['$timeout', function ($timeout) {
  return {
    template:
      '<div class="stream-chat" ng-class="{\'is-setup\': showSetup}">' +
        '<div class="stream-chat__toolbar">' +
          '<span class="stream-chat__logo">T</span>' +
          '<span class="stream-chat__heading"><strong>Twitch Chat</strong><small>{{ connectionDetail }}</small></span>' +
          '<span class="stream-chat__connection" ng-class="connectionState" title="{{ connectionDetail }}"></span>' +
          '<button type="button" class="stream-chat__quick-settings-button" ng-click="toggleQuickSettings()" ng-class="{active: showQuickSettings}" aria-label="Chat display settings" aria-expanded="{{ showQuickSettings }}" title="Chat display settings"><span aria-hidden="true">&#9881;</span></button>' +
          '<button type="button" class="stream-chat__settings-button" ng-click="toggleSetup()" ng-class="{active: showSetup}">{{ showSetup ? "Close" : "Setup" }}</button>' +
        '</div>' +
        '<div class="stream-chat__quick-settings" ng-if="showQuickSettings">' +
          '<div class="stream-chat__quick-settings-heading"><strong>Chat settings</strong><button type="button" ng-click="toggleQuickSettings()" aria-label="Close chat settings">&times;</button></div>' +
          '<label><span>Messages shown</span><small>Choose between 1 and 100</small><input type="number" name="quickMaxMessages" ng-model="settings.maxMessages" min="1" max="100" step="1" ng-change="updateMessageLimit()" ng-blur="commitMessageLimit()" aria-label="Maximum chat messages shown"></label>' +
        '</div>' +
        '<form class="stream-chat__setup" ng-if="showSetup" ng-submit="startDeviceLogin()">' +
          '<div class="stream-chat__setup-heading"><strong>Connect your Twitch account</strong><span>No access token or client secret needed.</span></div>' +
          '<label><span>Application Client ID</span><span class="stream-chat__secret-field"><input ng-attr-type="{{ showClientId ? \'text\' : \'password\' }}" name="twitchClientId" ng-model="settings.twitchClientId" autocomplete="new-password" spellcheck="false" placeholder="Paste your Twitch Client ID" aria-label="Twitch Application Client ID"><button type="button" ng-click="showClientId = !showClientId" aria-label="{{ showClientId ? \'Hide Client ID\' : \'Show Client ID\' }}">{{ showClientId ? "Hide" : "Show" }}</button></span><small>Use the public Client ID from your own Twitch developer application.</small></label>' +
          '<small class="stream-chat__account-note">Chat is locked to the Twitch account you authorize.</small>' +
          '<div class="stream-chat__device" ng-if="auth.userCode">' +
            '<span>YOUR TWITCH CODE</span>' +
            '<strong>{{ auth.userCode }}</strong>' +
            '<button type="button" ng-click="openTwitchActivation()">Open Twitch activation <span aria-hidden="true">↗</span></button>' +
          '</div>' +
          '<div class="stream-chat__setup-actions">' +
            '<button class="primary" type="submit" ng-disabled="auth.busy">{{ auth.busy ? "Waiting for Twitch…" : (settings.twitchPairingKey ? "Reconnect Twitch" : "Connect Twitch") }}</button>' +
            '<button class="secondary" type="button" ng-click="forgetLogin()" ng-if="settings.twitchPairingKey">Forget login</button>' +
          '</div>' +
          '<small class="stream-chat__privacy"><span>🔒</span> Login is encrypted for this Windows account.</small>' +
        '</form>' +
        '<div class="stream-chat__messages" ng-if="!showSetup">' +
          '<div class="stream-chat__empty" ng-if="messages.length === 0">{{ emptyText }}</div>' +
          '<div class="stream-chat__message platform-twitch" ng-repeat="item in messages track by item.key">' +
            '<span class="stream-chat__author" ng-style="{color: item.author.color}">{{ item.author.name }}</span><span class="stream-chat__colon">:</span>' +
            '<span class="stream-chat__text" ng-bind="item.message.text"></span>' +
          '</div>' +
        '</div>' +
        '<div class="stream-chat__status" ng-if="statusText">{{ statusText }}</div>' +
      '</div>',
    replace: true,
    restrict: 'EA',
    link: function (scope, element) {
      var connectionGeneration = 0;
      var destroyed = false;
      var seenMessageIds = Object.create(null);
      var seenMessageOrder = [];
      var resolved = null;
      var authPollTimer = null;
      var chatPollTimer = null;

      scope.messages = [];
      scope.settings = {
        maxMessages: 100,
        twitchClientId: '',
        twitchPairingKey: ''
      };
      scope.auth = { busy: false, userCode: '', verificationUri: '' };
      scope.showSetup = false;
      scope.showQuickSettings = false;
      scope.showClientId = false;
      scope.connectionState = 'connecting';
      scope.connectionDetail = 'Twitch is not configured';
      scope.emptyText = 'Waiting for Twitch chat…';
      scope.statusText = '';

      element.ready(function () {
        var saved = loadSettings();
        if (saved) {
          scope.settings.maxMessages = normalizeMessageLimit(saved.maxMessages);
          scope.settings.twitchClientId = saved.twitchClientId || '';
          scope.settings.twitchPairingKey = saved.twitchPairingKey || '';
        }
        if (hasConfiguration()) {
          connectTwitch();
        } else {
          scope.showSetup = true;
          setStatus('disabled', 'Enter your Twitch details and select Connect', 'Twitch setup required');
        }
      });

      scope.toggleSetup = function () {
        scope.showQuickSettings = false;
        scope.showSetup = !scope.showSetup;
      };
      scope.toggleQuickSettings = function () {
        if (scope.showQuickSettings) scope.commitMessageLimit();
        scope.showQuickSettings = !scope.showQuickSettings;
      };
      scope.updateMessageLimit = function () {
        var limit = validMessageLimit(scope.settings.maxMessages);
        if (limit === null) return;
        scope.settings.maxMessages = limit;
        trimMessages();
        saveSettings();
      };
      scope.commitMessageLimit = function () {
        scope.settings.maxMessages = normalizeMessageLimit(scope.settings.maxMessages);
        trimMessages();
        saveSettings();
      };
      scope.openTwitchActivation = function () {
        if (!scope.auth.verificationUri) return;
        helperRequest('/api/v1/auth/twitch/open', { url: scope.auth.verificationUri }).catch(function (error) {
          setStatus('error', helperError(error), 'Could not open Twitch activation');
        });
      };
      scope.startDeviceLogin = function () {
        normalizeSettings();
        saveSettings();
        if (!scope.settings.twitchClientId) {
          setStatus('error', 'Client ID is required', 'Twitch configuration is incomplete');
          return;
        }
        cancelAuthPoll();
        scope.auth.busy = true;
        scope.auth.userCode = '';
        scope.auth.verificationUri = '';
        setStatus('connecting', 'Contacting the Stream Chat background service…', 'Starting Twitch login');
        helperRequest('/api/v1/auth/twitch/device', { clientId: scope.settings.twitchClientId })
          .then(function (login) {
            scope.auth.userCode = login.userCode || '';
            scope.auth.verificationUri = login.verificationUri || '';
            setStatus('connecting', 'Waiting for you to approve the code on Twitch…', 'Waiting for Twitch authorization');
            scheduleAuthPoll(login.authorizationId, Number(login.interval || 5) * 1000);
          })
          .catch(function (error) {
            scope.auth.busy = false;
            setStatus('error', helperError(error), 'Could not start Twitch login');
          });
      };
      scope.forgetLogin = function () {
        cancelAuthPoll();
        if (!scope.settings.twitchPairingKey) return;
        scope.auth.busy = true;
        helperRequest('/api/v1/auth/twitch/forget', { pairingKey: scope.settings.twitchPairingKey })
          .then(function () {
            scope.settings.twitchPairingKey = '';
            saveSettings();
            stopConnection();
            scope.auth.busy = false;
            setStatus('disabled', 'Encrypted Twitch login deleted', 'Twitch setup required');
          })
          .catch(function (error) {
            scope.auth.busy = false;
            setStatus('error', helperError(error), 'Could not delete Twitch login');
          });
      };
      scope.badgeText = function (badges) { return badges.join(' · '); };

      function connectTwitch() {
        var generation = ++connectionGeneration;
        clearChatPoll();
        resolved = null;
        setStatus('connecting', '', 'Connecting through the Stream Chat background service');

        helperRequest('/api/v1/chat/twitch/connect', {
          clientId: scope.settings.twitchClientId,
          pairingKey: scope.settings.twitchPairingKey
        }).then(function (connectionDetails) {
            if (!isCurrent(generation)) return;
            resolved = { broadcasterName: connectionDetails.channel || 'Twitch' };
            pollChat(generation);
          })
          .catch(function (error) {
            if (!isCurrent(generation)) return;
            setStatus('error', readableError(error), 'Twitch connection failed');
          });
      }

      function pollChat(generation) {
        if (!isCurrent(generation)) return;
        helperRequest('/api/v1/chat/events', {}).then(function (response) {
          if (!isCurrent(generation)) return;
          var events = Array.isArray(response.events) ? response.events : [];
          events.forEach(function (event) {
            if (event.type === 'chat.message' && event.data && event.data.platform === 'twitch') {
              apply(function () { appendCompanionMessage(event.data); });
            } else if (event.type === 'provider.status' && event.data && event.data.platform === 'twitch') {
              if (event.data.state === 'connected') {
                setStatus('connected', '', 'Reading ' + (resolved.broadcasterName || 'Twitch') + ' chat');
              } else if (event.data.state === 'connecting') {
                setStatus('connecting', '', 'Connecting to Twitch EventSub');
              } else if (event.data.state === 'error') {
                setStatus('error', event.data.detail || 'Twitch connection failed', 'Twitch service error');
              }
            }
          });
          chatPollTimer = $timeout(function () { pollChat(generation); }, 750, false);
        }).catch(function (error) {
          if (!isCurrent(generation)) return;
          setStatus('error', helperError(error), 'Lost connection to Stream Chat service');
          chatPollTimer = $timeout(function () { pollChat(generation); }, 2000, false);
        });
      }

      function scheduleAuthPoll(authorizationId, delay) {
        authPollTimer = $timeout(function () {
          helperRequest('/api/v1/auth/twitch/poll', { authorizationId: authorizationId })
            .then(function (result) {
              if (result.state === 'authorized') {
                scope.settings.twitchPairingKey = result.pairingKey;
                saveSettings();
                scope.auth.busy = false;
                scope.auth.userCode = '';
                scope.auth.verificationUri = '';
                scope.showSetup = false;
                connectTwitch();
              } else if (result.state === 'expired') {
                scope.auth.busy = false;
                setStatus('error', 'The Twitch login code expired. Select Connect Twitch to try again.', 'Twitch login expired');
              } else {
                scheduleAuthPoll(authorizationId, delay);
              }
            })
            .catch(function (error) {
              scope.auth.busy = false;
              setStatus('error', helperError(error), 'Twitch login polling failed');
            });
        }, Math.max(1000, delay));
      }

      function appendCompanionMessage(message) {
        if (!message || !message.id || seenMessageIds[message.id]) return;
        seenMessageIds[message.id] = true;
        seenMessageOrder.push(message.id);
        if (seenMessageOrder.length > 1000) delete seenMessageIds[seenMessageOrder.shift()];
        scope.messages.push({
          key: 'twitch:' + message.id,
          id: String(message.id),
          platform: 'twitch',
          author: {
            id: String(message.author && message.author.id || ''),
            name: String(message.author && message.author.name || 'Unknown'),
            color: validColor(message.author && message.author.color) ? message.author.color : undefined,
            badges: Array.isArray(message.author && message.author.badges) ? message.author.badges : []
          },
          message: { text: String(message.message && message.message.text || '') },
          publishedAt: String(message.publishedAt || new Date().toISOString())
        });
        while (scope.messages.length > scope.settings.maxMessages) scope.messages.shift();
        scrollToBottom();
      }

      function normalizeSettings() {
        scope.settings.maxMessages = normalizeMessageLimit(scope.settings.maxMessages);
        scope.settings.twitchClientId = String(scope.settings.twitchClientId || '').trim();
        scope.settings.twitchPairingKey = String(scope.settings.twitchPairingKey || '').trim();
      }
      function hasConfiguration() {
        normalizeSettings();
        return Boolean(scope.settings.twitchClientId && scope.settings.twitchPairingKey);
      }
      function validColor(value) {
        return typeof value === 'string' && (/^#[0-9a-f]{3,8}$/i.test(value) || /^rgba?\([\d\s.,%]+\)$/i.test(value));
      }
      function normalizeMessageLimit(value) {
        var limit = Number(value);
        if (!isFinite(limit)) limit = 100;
        return Math.min(100, Math.max(1, Math.floor(limit)));
      }
      function validMessageLimit(value) {
        var limit = Number(value);
        if (!isFinite(limit) || limit < 1 || limit > 100) return null;
        return Math.floor(limit);
      }
      function trimMessages() {
        while (scope.messages.length > scope.settings.maxMessages) scope.messages.shift();
      }
      function readableError(error) {
        var response = error && error.data;
        if (response && response.message) return String(response.message);
        if (error && error.message) return String(error.message);
        return 'Unknown Twitch error';
      }
      function helperError(error) {
        var response = error && error.data;
        if (response && response.error) return String(response.error);
        if (error && error.status === -1) return 'The Stream Chat background service is not running';
        return readableError(error);
      }
      function helperRequest(path, payload) {
        return new Promise(function (resolve, reject) {
          if (!window.bngApi || typeof window.bngApi.engineLua !== 'function') {
            reject(new Error('BeamNG Lua bridge is unavailable'));
            return;
          }
          var lua = "(function() extensions.load('streamChatAuth'); return extensions.streamChatAuth.request(" +
            window.bngApi.serializeToLua(path) + ', ' + window.bngApi.serializeToLua(payload) + ') end)()';
          window.bngApi.engineLua(lua, function (response) {
            if (!response) reject(new Error('The BeamNG login bridge returned no response'));
            else if (response.error) reject(new Error(String(response.error)));
            else resolve(response);
          });
        });
      }
      function loadSettings() {
        try {
          return JSON.parse(localStorage.getItem('beamng-stream-chat-settings-v1') || 'null');
        } catch (error) {
          return null;
        }
      }
      function saveSettings() {
        try {
          localStorage.setItem('beamng-stream-chat-settings-v1', JSON.stringify(scope.settings));
        } catch (error) {
          setStatus('error', 'BeamNG could not save the Twitch settings', 'Settings storage failed');
        }
      }
      function setStatus(state, text, detail) {
        apply(function () {
          scope.connectionState = state;
          scope.statusText = text;
          scope.connectionDetail = detail;
        });
      }
      function scrollToBottom() {
        $timeout(function () {
          var container = element[0].querySelector('.stream-chat__messages');
          if (container) container.scrollTop = container.scrollHeight;
        }, 0, false);
      }
      function apply(callback) {
        if (!destroyed) scope.$evalAsync(callback);
      }
      function isCurrent(generation) {
        return !destroyed && generation === connectionGeneration;
      }
      function clearChatPoll() {
        if (chatPollTimer) $timeout.cancel(chatPollTimer);
        chatPollTimer = null;
      }
      function cancelAuthPoll() {
        if (authPollTimer) $timeout.cancel(authPollTimer);
        authPollTimer = null;
        scope.auth.busy = false;
      }
      function stopConnection() {
        connectionGeneration++;
        clearChatPoll();
        resolved = null;
      }

      scope.$on('$destroy', function () {
        destroyed = true;
        cancelAuthPoll();
        stopConnection();
        saveSettings();
      });
    }
  };
}]);

/*
 * Akamai HD flash video plugin
 */

require("../../../html5-common/js/utils/InitModules/InitOO.js");
require("../../../html5-common/js/utils/InitModules/InitOOUnderscore.js");
require("../../../html5-common/js/utils/InitModules/InitOOHazmat.js");
require("../../../html5-common/js/utils/constants.js");
(function(_, $) {
  var pluginName = "ooyalaAkamaiHDFlashVideoTech";
  var flashMinimumVersion = "11.1.0";
  var cssFromContainer;
  var flashItems = {}; // container for all current flash objects in the Dom controlled by the Ooyala player.

  /**
   * Config variables for paths to flash resources.
   */

  var pluginPath;
  var filename = "akamaiHD_flash.*\.js";
  var scripts = document.getElementsByTagName('script');
  for (var index in scripts) {
    var match = scripts[index].src.match(filename);
    if (match && match.length > 0) {
      pluginPath = match.input.match(/.*\//)[0];
      break;
    }
  }
  if (!pluginPath) {
    console.error("Can't get path to script", filename);
    return;
  }
  pluginPath += "akamaiHD_flash.swf";
  var flexPath = "playerProductInstall.swf";
  /**
   * @class OoyalaAkamaiHDFlashVideoFactory
   * @classdesc Factory for creating video player objects that use Flash in an HTML5 wrapper.
   * @property {string} name The name of the plugin
   * @property {boolean} ready The readiness of the plugin for use.  True if elements can be created.
   * @property {object} encodings An array of supported encoding types (ex. m3u8, mp4)
   */

  var OoyalaAkamaiHDFlashVideoFactory = function() {
    this.name = pluginName;
    /**
     * Checks whether flash player is available
     * @public
     * @method getFlashVersion
     * @returns encoding as hds if flash version is available
     */
    function getFlashVersion() {
      // ie
      try {
        try {
          var axo = new ActiveXObject('ShockwaveFlash.ShockwaveFlash.6');
          try {
            axo.AllowScriptAccess = 'always';
          }
          catch(e) {
           return '6,0,0';
          }
        }
        catch(e) {}
        return new ActiveXObject('ShockwaveFlash.ShockwaveFlash').GetVariable('$version').replace(/\D+/g, ',').match(/^,?(.+),?$/)[1];
      }
      // other browsers
      catch(e) {
        try {
          if (navigator.mimeTypes["application/x-shockwave-flash"].enabledPlugin) {
            return (navigator.plugins["Shockwave Flash 2.0"] || navigator.plugins["Shockwave Flash"]).description.replace(/\D+/g, ",").match(/^,?(.+),?$/)[1];
          }
        }
        catch(e) {}
      }
      return '0,0,0';
    }

    function testForFlash() {
      var version = getFlashVersion().split(',').shift();
      if (version < 11) {
        console.error("NO FLASH DETECTED");
        return [];
      } else {
        return [ OO.VIDEO.ENCODING.AKAMAI_HD2_VOD_HDS ];
      }
    }
    this.encodings = testForFlash();
    this.technology = OO.VIDEO.TECHNOLOGY.FLASH;
    this.features = [ OO.VIDEO.FEATURE.CLOSED_CAPTIONS,
                      OO.VIDEO.FEATURE.BITRATE_CONTROL ];

    /**
     * Creates a video player instance using OoyalaAkamaiHDFlashVideoWrapper.
     * @public
     * @method OoyalaAkamaiHDFlashVideoFactory#create
     * @param {object} parentContainer The jquery div that should act as the parent for the video element
     * @param {string} id The id of the video player instance to create
     * @param {object} controller A reference to the video controller in the Ooyala player
     * @param {object} css The css to apply to the video element
     * @returns {object} A reference to the wrapper for the newly created element
     */
    this.create = function(parentContainer, domId, controller, css, playerId) {
      var video = $("<object>");
      video.attr("class", "video");
      video.attr("id", domId);
      video.attr("preload", "none");

      cssFromContainer = css;

      if (!playerId) {
        playerId = getRandomString();
      }
      parentContainer.append(video);


      element = new OoyalaAkamaiHDFlashVideoWrapper(domId, video[0], parentContainer, playerId);
      element.controller = controller;
      controller.notify(controller.EVENTS.CAN_PLAY);
      return element;
    };

    /**
     * Destroys the video technology factory.
     * @public
     * @method OoyalaAkamaiHDFlashVideoFactory#destroy
     */
    this.destroy = function() {
      this.encodings = [];
      this.create = function() {};
    };

    /**
     * Represents the max number of support instances of video elements that can be supported on the
     * current platform. -1 implies no limit.
     * @public
     * @property OoyalaAkamaiHDFlashVideoFactory#maxSupportedElements
     */
    this.maxSupportedElements = -1;
  };

  /**
   * @class OoyalaAkamaiHDFlashVideoWrapper
   * @classdesc Player object that wraps the video element.
   * @param {string} domId The id of the video player element
   * @param {object} video The core video object to wrap - unused.
   * @param {string} parentContainer Id of the Div element in which the swf will be embedded
   * @param {object} css The css to apply to the object element
   * @property {object} controller A reference to the Ooyala Video Tech Controller
   * @property {boolean} disableNativeSeek When true, the plugin should supress or undo seeks that come from
   *                                       native video controls
   */
  var OoyalaAkamaiHDFlashVideoWrapper = function(domId, video, parentContainer, playerId) {
    this.controller = {};
    this.disableNativeSeek = false;
    this.id=domId;
    if(!parentContainer) parentContainer = "container";

    var videoItem; // reference to the current swf being acted upon.
    var listeners = {};
    var currentUrl = '';
    var urlChanged = false;
    var videoEnded = false;
    var loaded = false;
    var hasPlayed = false;
    var firstPlay = true;
    var self=this;
    var currentTime;
    var totalTime;
    var seekRange_end;
    var buffer;
    var seekRange_start;
    var javascriptCommandQueue = [];

    this.controller = {};
    this.disableNativeSeek = false;

    var flashvars = {};

    var params = {};
    params.quality = "high";
    params.bgcolor = "#000000";
    params.allowscriptaccess = "always";
    params.allowfullscreen = "true";
    params.wmode = "opaque";
    params.scale = "showAll";

    var attributes = {};
    attributes.id = domId;
    attributes.class = 'video';
    attributes.preload = 'none';
    attributes.style = 'position:absolute;';
    // Combine the css object into a string for swfobject.
    if (cssFromContainer.length) {
      for(i in cssFromContainer) {
        attributes.style += i + ":" + cssFromContainer[i] + "; ";
      }
    }
    attributes.name = domId;
    attributes.align = "middle";
    swfobject.embedSWF(
      pluginPath, domId,
      "100%", "100%",
      flashMinimumVersion, flexPath,
      flashvars, params, attributes);

    flashItems[this.id] = this;
    videoItem = getSwf(this.id);

    var _readyToPlay = false; // should be set to true on canplay event
    var actionscriptCommandQueue = [];

    /************************************************************************************/
    // Required. Methods that Video Controller, Destroy, or Factory call
    /************************************************************************************/

    // Return if the Dom and JavaScript are ready.
    // We cannot predict the presence of jQuery, so use a core javascript technique here.
    isReady = _.bind(function() {
      if (document.readyState === "complete") {
        if(videoItem == undefined) videoItem = getSwf(this.id);
        return true;
      }
    },this);

    /**
     * Sets the url of the video.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#setVideoUrl
     * @param {string} url The new url to insert into the video element's src attribute
     * @param {string} encoding The encoding of video stream
     * @returns {boolean} True or false indicating success
     */
    this.setVideoUrl = function(url, encoding) {
      if (currentUrl.replace(/[\?&]_=[^&]+$/,'') != url) {
        currentUrl = url || "";

        // bust the chrome caching bug
        if (currentUrl.length > 0) {
          currentUrl = currentUrl + (/\?/.test(currentUrl) ? "&" : "?") + "_=" + getRandomString();
        }
        urlChanged = true;
        hasPlayed = false;
        loaded = false;
        firstPlay = true;
        url = "setVideoUrl("+currentUrl+")";
      }
      if (!_.isEmpty(currentUrl)) {
        this.callToFlash(url);
      }
      return urlChanged;
    };

    /**
     * Set the embed code and player id for the secure HD stream.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#setSecureContent
     * @param {object} contentMetadata The object with the content metadata info.
     */
    this.setSecureContent = function(contentMetadata)
    {      
      this.callToFlash("setSecureContent()", contentMetadata);
    };

    /**
     * Sets the closed captions on the video element.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#setClosedCaptions
     * @param {string} language Selected language of captions
     * @param {object} closedCaptions The captions object
     * @param {object} params The parameters object
     */
    this.setClosedCaptions = function(language,closedCaptions,params){
      var parameters = {language:language, closedCaptions:closedCaptions, params:params};
      this.callToFlash("setVideoClosedCaptions()" , parameters);
    };

    /**
     * Sets the closed captions mode of the video playback.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#setClosedCaptionsMode
     * @param {string} mode Mode of the captions(disabled/showing)
     */

    this.setClosedCaptionsMode = function(mode) {
      this.callToFlash("setVideoClosedCaptionsMode(" + mode + ")");
    };

    /**
     * Sets the stream to play back based on given stream ID. Plugin must support the
     * BITRATE_CONTROL feature to have this method called.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#setBitrate
     * @param {string} id The ID of the stream to switch to. This ID will be the ID property from one
     *   of the stream objects passed with the BITRATES_AVAILABLE VTC event.
     *   An ID of 'auto' should return the plugin to automatic bitrate selection.
     */
    this.setBitrate = function(id) {
      this.callToFlash("setTargetBitrate(" + id + ")");
    };

    /**
     * Loads the current stream url in the video element; the element should be left paused.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#load
     * @param {boolean} rewind True if the stream should be set to time 0
     */
    this.load = function(rewind) {
      if (loaded && !rewind) return;
      else {
        try {
          this.callToFlash("load("+rewind+")");
          loaded = true;
        } catch (ex) {
          // error because currentTime does not exist because stream hasn't been retrieved yet
          console.log('[Akamai HD]: Failed to rewind video, probably ok; continuing');
        }
      }
    };

    /**
     * Sets the initial time of the video playback.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#setInitialTime
     * @param {number} initialTime The initial time of the video (seconds)
     */
    this.setInitialTime = function(initialTime) {
      if (!hasPlayed) {
        this.seek(initialTime);
      }
    };

    /**
     * Triggers playback on the video element.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#play
     */
    this.play = function() {
      if (!loaded) {
        this.load(true);
      }
      this.callToFlash("videoPlay");
      loaded = true;
      hasPlayed = true;
      videoEnded = false;
    };

    /**
     * Triggers a pause on the video element.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#pause
     */
    this.pause = function() {
      this.callToFlash("videoPause");
    };

    /**
     * Triggers a seek on the video element.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#seek
     * @param {number} time The time to seek the video to (in seconds)
     */
    this.seek = function(time) {
      this.callToFlash("videoSeek(" + time + ")");
    };

    /**
     * Triggers a volume change on the video element.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#setVolume
     * @param {number} volume A number between 0 and 1 indicating the desired volume percentage
     */
    this.setVolume = function(volume) {
      this.callToFlash("changeVolume(" + volume + ")");
    };

    /**
     * Gets the current time position of the video.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#getCurrentTime
     * @returns {number} The current time position of the video (seconds)
     */
    this.getCurrentTime = function() {
      this.callToFlash("getCurrentTime");
      return currentTime;
    }

    /**
     * Applies the given css to the video element.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#applyCss
     * @param {object} css The css to apply in key value pairs
     */
    this.applyCss = function(css) {
      $(videoItem).css(css);
    };

    /**
     * Destroys the individual video element.
     * @public
     * @method OoyalaAkamaiHDFlashVideoWrapper#destroy
     */
    this.destroy = function() {
      // Pause the video
      this.pause();
      // Reset the source
      this.setVideoUrl('');

      // Pass destroy to flash plugin.
      this.callToFlash("destroy");

      // Remove the element
      $('#'+domId).replaceWith('');
      videoItem=null;
      $(videoItem).remove();
      delete flashItems[this.id];
    };

    // Calls a Flash method
    this.callToFlash = function (data,dataObj) {
      if(videoItem == undefined) { 
        javascriptCommandQueue.push([data,dataObj]);
      } else {
        if (videoItem.sendToActionScript) {
          dataObj = typeof dataObj != 'undefined' ? dataObj : "null";
          return videoItem.sendToActionScript(data,dataObj, this.id);
        } else {
          if(actionscriptCommandQueue.length <= 100) {
            actionscriptCommandQueue.push([data,dataObj]);
          } else {
            actionscriptCommandQueue.shift();
            actionscriptCommandQueue.push([data,dataObj]);
          }
        }
      }
    };

    /**
     * Stores the url of the video when load is started.
     * @private
     * @method OoyalaAkamaiHDFlashVideoWrapper#onLoadStart
     */
    var onLoadStart = function() {
      firstPlay = true;
      currentUrl = this.callToFlash("getUrl");
    };

    var onLoadedMetadata = function() {
      dequeueSeek();
    };

    var raisePlayEvent = function(event) {
      self.controller.notify(self.controller.EVENTS.PLAY, { url: event.eventObject.url });
    };

    var raisePlayingEvent = function() {
      self.controller.notify(self.controller.EVENTS.PLAYING);
    };

    var raiseEndedEvent = function() {
      if (videoEnded) { return; } // no double firing ended event.
      videoEnded = true;
      self.controller.notify(self.controller.EVENTS.ENDED);
    };

    var raiseErrorEvent = function(event) {
      var code = event.eventObject.errorCode ? event.eventObject.errorCode : -1;
      self.controller.notify(self.controller.EVENTS.ERROR, { "errorcode" : code });
    };

    var raiseSeekingEvent = function() {
      self.controller.notify(self.controller.EVENTS.SEEKING);
    };

    var raiseSeekedEvent = function() {
      self.controller.notify(self.controller.EVENTS.SEEKED);
    };

    var raiseBufferingEvent = function() {
      self.controller.notify(self.controller.EVENTS.BUFFERING);
    };

    var raisePauseEvent = function() {
      self.controller.notify(self.controller.EVENTS.PAUSED);
    };

    var raiseRatechangeEvent = function() {
    };

    var raiseStalledEvent = function() {
    };

    var raiseVolumeEvent = function(event) {
      self.controller.notify(self.controller.EVENTS.VOLUME_CHANGE, { "volume" : event.eventObject.volume });
    };

    var raiseWaitingEvent = function() {
    };

    var raiseTimeUpdate = function(event) {
      raisePlayhead(self.controller.EVENTS.TIME_UPDATE, event);
    };

    var raiseDurationChange = function(event) {
    };

    /**
     * Notifies the controller of events that provide playhead information.
     * @private
     * @method OoyalaVideoWrapper#raisePlayhead
     */
    var raisePlayhead = _.bind(function(eventname, event) {
      self.controller.notify(eventname,
                             { "currentTime" : currentTime,
                               "duration" : totalTime,
                               "buffer" : buffer,
                               "seekRange" : { "begin" : seekRange_start, "end" : seekRange_end } });
    }, this);

    /**
     * Notifies the controller that a progress event was raised.
     * @private
     * @method OoyalaVideoWrapper#raiseProgress
     * @param {object} event The event from the video
     */
    var raiseProgress = function(event) {
      self.controller.notify(self.controller.EVENTS.PROGRESS,
                             { "currentTime": currentTime,
                               "duration": totalTime,
                               "buffer": buffer,
                               "seekRange": { "begin": seekRange_start, "end": seekRange_end } });
    };

    var raiseCanPlayThrough = function() {
      self.controller.notify(self.controller.EVENTS.BUFFERED);
    };

    var raiseFullScreenBegin = function(event) {
      self.controller.notify(self.controller.EVENTS.FULLSCREEN_CHANGED,
                             { "isFullScreen" : true, "paused" : event.target.paused });
    };

    var raiseFullScreenEnd = function(event) {
      self.controller.notify(newControllerr.EVENTS.FULLSCREEN_CHANGED,
                             { "isFullScreen" : false, "paused" : event.target.paused });
    };

    var raiseBitrateChanged = function(event) {
      var vtcBitrate = {
          id: event.eventObject.id,
          width: event.eventObject.width,
          height: event.eventObject.height,
          bitrate: event.eventObject.bitrate
      }
      self.controller.notify(self.controller.EVENTS.BITRATE_CHANGED,vtcBitrate);
    };

    var raiseBitratesAvailable = function(event) {
      var vtcBitrates = [{id: "auto", width: 0, height: 0, bitrate: 0 }];
      for (var i in event.eventObject) {
        var vtcBitrate = {
          id: event.eventObject[i].id,
          width: event.eventObject[i].width,
          height: event.eventObject[i].height,
          bitrate: event.eventObject[i].bitrate
        }
        vtcBitrates.push(vtcBitrate);
      }
      self.controller.notify(self.controller.EVENTS.BITRATES_AVAILABLE,vtcBitrates);
    };

    var raiseSizeChanged = function(event) {
      var assetDimension = {
        width: event.eventObject.width,
        height: event.eventObject.height,
      }
      //notify VTC about the asset's dimentions
      if (firstPlay) {
        self.controller.notify(self.controller.EVENTS.ASSET_DIMENSION,assetDimension);
        firstPlay = false;
      } else {
        self.controller.notify(self.controller.EVENTS.SIZE_CHANGED,assetDimension);
      }
    };

    var raiseHiddenCaption = function(event) {
      var captionText = event.eventObject.text;
      self.controller.notify(self.controller.EVENTS.CLOSED_CAPTION_CUE_CHANGED,captionText);
    }

    var raiseCaptionFound = function(event) {
        var captionInfo = {
              language: "CC",
              inStream: true,
              label: "In-Stream"
            };
      self.controller.notify(self.controller.EVENTS.CAPTIONS_FOUND_ON_PLAYING,captionInfo);
    }

    call = function() {
        OO.log('[AkamaiHD]:JFlashBridge: Call: ', arguments);

        var klass = flashItems[arguments[0]];

        if (klass) {
          klass.onCallback(arguments[2]);
        } else {
          OO.log('[AkamaiHD]:JFlashBridge: No binding: ', arguments);
        }
      };

    // Receives a callback from Flash
    this.onCallback = function(data) {
      var eventtitle =" ";

      for(var key in data) {
        if (key == "eventtype") {
             eventtitle = data[key];
        } else if (key =="eventObject") {
              eventData = data[key];
        }
      }
      if (eventData != null) {
        for (var item in eventData) {
          if (item == "currentTime") {
                currentTime = eventData[item];
          } else if (item == "buffer") {
                buffer = eventData[item];
          } else if (item == "duration") {
                totalTime =eventData[item];
          } else if (item == "seekRange_start") {
                seekRange_start = eventData[item];
          } else if (item == "seekRange_end") {
                seekRange_end = eventData[item];
          }
        }
      }

      switch (eventtitle) {
       case "JSREADY":
        if(javascriptCommandQueue.length != 0) {
          for(var i = 0; i < javascriptCommandQueue.length; i++) {
            this.callToFlash(javascriptCommandQueue[i][0], javascriptCommandQueue[i][1]);
          }
        }
        for (i = 0; i < actionscriptCommandQueue.length; i++) {
          this.callToFlash(actionscriptCommandQueue[i][0],actionscriptCommandQueue[i][1]);
        }
        break;
       case "PAUSED":
        raisePauseEvent();
        break;
       case "BUFFERING":
        raiseBufferingEvent();
        break;
       case "PLAY":
        raisePlayEvent(data);
        break;
       case "PLAYING":
        raisePlayingEvent();
        break;
       case "ENDED":
        raiseEndedEvent();
        break;
       case "SEEKING":
        raiseSeekingEvent();
        break;
       case "SEEKED":
        raiseSeekedEvent();
        break;
       case "PAUSED":
        raisePauseEvent();
        break;
       case "RATE_CHANGE":
        raiseRatechangeEvent();
        break;
       case "STALLED":
        raiseStalledEvent();
        break;
       case "VOLUME_CHANGED":
        raiseVolumeEvent(data);
        break;
       case "WAITING":
        raiseWaitingEvent();
        break;
       case "TIME_UPDATE":
        raiseTimeUpdate(data);
        break;
       case "DURATION_CHANGE":
        raiseDurationChange();
        break;
       case "PROGRESS":
        raiseProgress(data);
        break;
       case "BUFFERED":
        raiseCanPlayThrough();
        break;
       case "FULLSCREEN_CHANGED":
        raiseFullScreenBegin(data);
        break;
       case "FULLSCREEN_CHANGED_END":
        raiseFullScreenEnd(data);
        break;
       case "BITRATES_AVAILABLE":
        raiseBitratesAvailable(data);
        break;
       case "BITRATE_CHANGED":
        raiseBitrateChanged(data);
        break;
       case "SIZE_CHANGED":
        raiseSizeChanged(data);
        break;
       case "CLOSED_CAPTION_CUE_CHANGED":
        raiseHiddenCaption(data);
        break;
       case "CAPTIONS_FOUND_ON_PLAYING":
        raiseCaptionFound(data);
        break;
       case "ERROR":
        raiseErrorEvent(data);
        break;
      }
      return true;
    }

  };

  /************************************************************************************/
  // Helper methods
  /************************************************************************************/

  /**
   * Returns the SWF instance present in the Dom matching the provided id
   * @private
   * @method OoyalaAkamaiHDFlashVideoWrapper#getSwf
   * @param {string} thisId the id of the swf object sought.
   * @returns {object} the object containing the desired swf.
   */
  var getSwf = function (thisId) {
    return document.getElementsByName(thisId)[0];
  };

  /**
   * Generates a random string.
   * @private
   * @method OoyalaAkamaiHDFlashVideoWrapper#getRandomString
   * @returns {string} A random string
   */
  var getRandomString = function() {
    return Math.random().toString(36).substring(7);
  };

  OO.Video.plugin(new OoyalaAkamaiHDFlashVideoFactory());
}(OO._, OO.$));

/*! SWFObject v2.2 <http://code.google.com/p/swfobject/>
  is released under the MIT License <http://www.opensource.org/licenses/mit-license.php>
*/
  /**
   * @class swfobject
   * @classdesc Establishes the connection between player and the plugin
   */

var swfobject = function() {

  var UNDEF = "undefined",
    OBJECT = "object",
    SHOCKWAVE_FLASH = "Shockwave Flash",
    SHOCKWAVE_FLASH_AX = "ShockwaveFlash.ShockwaveFlash",
    FLASH_MIME_TYPE = "application/x-shockwave-flash",
    EXPRESS_INSTALL_ID = "SWFObjectExprInst",
    ON_READY_STATE_CHANGE = "onreadystatechange",

    win = window,
    doc = document,
    nav = navigator,

    plugin = false,
    domLoadFnArr = [main],
    regObjArr = [],
    objIdArr = [],
    listenersArr = [],
    storedAltContent,
    storedAltContentId,
    storedCallbackFn,
    storedCallbackObj,
    isDomLoaded = false,
    isExpressInstallActive = false,
    dynamicStylesheet,
    dynamicStylesheetMedia,
    autoHideShow = true,

  /* Centralized function for browser feature detection
    - User agent string detection is only used when no good alternative is possible
    - Is executed directly for optimal performance
  */
  ua = function() {
    var w3cdom = typeof doc.getElementById != UNDEF && typeof doc.getElementsByTagName != UNDEF && typeof doc.createElement != UNDEF,
      u = nav.userAgent.toLowerCase(),
      p = nav.platform.toLowerCase(),
      windows = p ? /win/.test(p) : /win/.test(u),
      mac = p ? /mac/.test(p) : /mac/.test(u),
      webkit = /webkit/.test(u) ? parseFloat(u.replace(/^.*webkit\/(\d+(\.\d+)?).*$/, "$1")) : false, // returns either the webkit version or false if not webkit
      ie = ! + "\v1", // feature detection based on Andrea Giammarchi's solution: http://webreflection.blogspot.com/2009/01/32-bytes-to-know-if-your-browser-is-ie.html
      playerVersion = [0,0,0],
      d = null;
    if (typeof nav.plugins != UNDEF && typeof nav.plugins[SHOCKWAVE_FLASH] == OBJECT) {
      d = nav.plugins[SHOCKWAVE_FLASH].description;
      if (d && !(typeof nav.mimeTypes != UNDEF && nav.mimeTypes[FLASH_MIME_TYPE] && !nav.mimeTypes[FLASH_MIME_TYPE].enabledPlugin)) { // navigator.mimeTypes["application/x-shockwave-flash"].enabledPlugin indicates whether plug-ins are enabled or disabled in Safari 3+
        plugin = true;
        ie = false; // cascaded feature detection for Internet Explorer
        d = d.replace(/^.*\s+(\S+\s+\S+$)/, "$1");
        playerVersion[0] = parseInt(d.replace(/^(.*)\..*$/, "$1"), 10);
        playerVersion[1] = parseInt(d.replace(/^.*\.(.*)\s.*$/, "$1"), 10);
        playerVersion[2] = /[a-zA-Z]/.test(d) ? parseInt(d.replace(/^.*[a-zA-Z]+(.*)$/, "$1"), 10) : 0;
      }
    } else if (typeof win.ActiveXObject != UNDEF) {
      try {
        var a = new ActiveXObject(SHOCKWAVE_FLASH_AX);
        if (a) { // a will return null when ActiveX is disabled
          d = a.GetVariable("$version");
          if (d) {
            ie = true; // cascaded feature detection for Internet Explorer
            d = d.split(" ")[1].split(",");
            playerVersion = [parseInt(d[0], 10), parseInt(d[1], 10), parseInt(d[2], 10)];
          }
        }
      }
      catch(e) {}
    }
    return { w3:w3cdom, pv:playerVersion, wk:webkit, ie:ie, win:windows, mac:mac };
  }(),

  /* Cross-browser onDomLoad
    - Will fire an event as soon as the DOM of a web page is loaded
    - Internet Explorer workaround based on Diego Perini's solution: http://javascript.nwbox.com/IEContentLoaded/
    - Regular onload serves as fallback
  */
  onDomLoad = function() {
    if (!ua.w3) { return; }
    if ((typeof doc.readyState != UNDEF && doc.readyState == "complete") || (typeof doc.readyState == UNDEF && (doc.getElementsByTagName("body")[0] || doc.body))) { // function is fired after onload, e.g. when script is inserted dynamically
      callDomLoadFunctions();
    }
    if (!isDomLoaded) {
      if (typeof doc.addEventListener != UNDEF) {
        doc.addEventListener("DOMContentLoaded", callDomLoadFunctions, false);
      }
      if (ua.ie && ua.win) {
        doc.attachEvent(ON_READY_STATE_CHANGE, function() {
          if (doc.readyState == "complete") {
            doc.detachEvent(ON_READY_STATE_CHANGE, arguments.callee);
            callDomLoadFunctions();
          }
        });
        if (win == top) { // if not inside an iframe
          (function() {
            if (isDomLoaded) { return; }
            try {
              doc.documentElement.doScroll("left");
            }
            catch(e) {
              setTimeout(arguments.callee, 0);
              return;
            }
            callDomLoadFunctions();
          })();
        }
      }
      if (ua.wk) {
        (function() {
          if (isDomLoaded) { return; }
          if (!/loaded|complete/.test(doc.readyState)) {
            setTimeout(arguments.callee, 0);
            return;
          }
          callDomLoadFunctions();
        })();
      }
      addLoadEvent(callDomLoadFunctions);
    }
  }();

  function callDomLoadFunctions() {
    if (isDomLoaded) { return; }
    try { // test if we can really add/remove elements to/from the DOM; we don't want to fire it too early
      var t = doc.getElementsByTagName("body")[0].appendChild(createElement("span"));
      t.parentNode.removeChild(t);
    }
    catch (e) { return; }
    isDomLoaded = true;
    var dl = domLoadFnArr.length;
    for (var i = 0; i < dl; i++) {
      domLoadFnArr[i]();
    }
  }

  function addDomLoadEvent(fn) {
    OO.log("[Akamai HD : addDomLoadEvent]","dom Load event");

    if (isDomLoaded) {
      fn();
    } else {
      domLoadFnArr[domLoadFnArr.length] = fn; // Array.push() is only available in IE5.5+
    }
  }

  /* Cross-browser onload
    - Based on James Edwards' solution: http://brothercake.com/site/resources/scripts/onload/
    - Will fire an event as soon as a web page including all of its assets are loaded
   */
  function addLoadEvent(fn) {
    if (typeof win.addEventListener != UNDEF) {
      win.addEventListener("load", fn, false);
    } else if (typeof doc.addEventListener != UNDEF) {
      doc.addEventListener("load", fn, false);
    } else if (typeof win.attachEvent != UNDEF) {
      addListener(win, "onload", fn);
    } else if (typeof win.onload == "function") {
      var fnOld = win.onload;
      win.onload = function() {
        fnOld();
        fn();
      };
    } else {
      win.onload = fn;
    }
  }

  /* Main function
    - Will preferably execute onDomLoad, otherwise onload (as a fallback)
  */
  function main() {
    if (plugin) {
      testPlayerVersion();
    } else {
      matchVersions();
    }
  }

  /* Detect the Flash Player version for non-Internet Explorer browsers
    - Detecting the plug-in version via the object element is more precise than using the plugins collection item's description:
      a. Both release and build numbers can be detected
      b. Avoid wrong descriptions by corrupt installers provided by Adobe
      c. Avoid wrong descriptions by multiple Flash Player entries in the plugin Array, caused by incorrect browser imports
    - Disadvantage of this method is that it depends on the availability of the DOM, while the plugins collection is immediately available
  */
  function testPlayerVersion() {
    var b = doc.getElementsByTagName("body")[0];
    var o = createElement(OBJECT);
    o.setAttribute("type", FLASH_MIME_TYPE);
    var t = b.appendChild(o);
    if (t) {
      var counter = 0;
      (function() {
        if (typeof t.GetVariable != UNDEF) {
          var d = t.GetVariable("$version");
          if (d) {
            d = d.split(" ")[1].split(",");
            ua.pv = [parseInt(d[0], 10), parseInt(d[1], 10), parseInt(d[2], 10)];
          }
        } else if (counter < 10) {
          counter++;
          setTimeout(arguments.callee, 10);
          return;
        }
        b.removeChild(o);
        t = null;
        matchVersions();
      })();
    } else {
      matchVersions();
    }
  }

  /* Perform Flash Player and SWF version matching; static publishing only
  */
  function matchVersions() {
    var rl = regObjArr.length;
    if (rl > 0) {
      for (var i = 0; i < rl; i++) { // for each registered object element
        var id = regObjArr[i].id;
        var cb = regObjArr[i].callbackFn;
        var cbObj = {success:false, id:id};
        if (ua.pv[0] > 0) {
          var obj = getElementById(id);
          if (obj) {
            if (hasPlayerVersion(regObjArr[i].swfVersion) && !(ua.wk && ua.wk < 312)) { // Flash Player version >= published SWF version: Houston, we have a match!
              setVisibility(id, true);
              if (cb) {
                cbObj.success = true;
                cbObj.ref = getObjectById(id);
                cb(cbObj);
              }
            } else if (regObjArr[i].expressInstall && canExpressInstall()) { // show the Adobe Express Install dialog if set by the web page author and if supported
              var att = {};
              att.data = regObjArr[i].expressInstall;
              att.width = obj.getAttribute("width") || "0";
              att.height = obj.getAttribute("height") || "0";
              if (obj.getAttribute("class")) { att.styleclass = obj.getAttribute("class"); }
              if (obj.getAttribute("align")) { att.align = obj.getAttribute("align"); }
              // parse HTML object param element's name-value pairs
              var par = {};
              var p = obj.getElementsByTagName("param");
              var pl = p.length;
              for (var j = 0; j < pl; j++) {
                if (p[j].getAttribute("name").toLowerCase() != "movie") {
                  par[p[j].getAttribute("name")] = p[j].getAttribute("value");
                }
              }
              showExpressInstall(att, par, id, cb);
            } else { // Flash Player and SWF version mismatch or an older Webkit engine that ignores the HTML object element's nested param elements: display alternative content instead of SWF
              displayAltContent(obj);
              if (cb) { cb(cbObj); }
            }
          }
        } else {  // if no Flash Player is installed or the fp version cannot be detected we let the HTML object element do its job (either show a SWF or alternative content)
          setVisibility(id, true);
          if (cb) {
            var o = getObjectById(id); // test whether there is an HTML object element or not
            if (o && typeof o.SetVariable != UNDEF) {
              cbObj.success = true;
              cbObj.ref = o;
            }
            cb(cbObj);
          }
        }
      }
    }
  }

  function getObjectById(objectIdStr) {
    var r = null;
    var o = getElementById(objectIdStr);
    if (o && o.nodeName == "OBJECT") {
      if (typeof o.SetVariable != UNDEF) {
        r = o;
      } else {
        var n = o.getElementsByTagName(OBJECT)[0];
        if (n) {
          r = n;
        }
      }
    }
    return r;
  }

  /* Requirements for Adobe Express Install
    - only one instance can be active at a time
    - fp 6.0.65 or higher
    - Win/Mac OS only
    - no Webkit engines older than version 312
  */
  function canExpressInstall() {
    return !isExpressInstallActive && hasPlayerVersion("6.0.65") && (ua.win || ua.mac) && !(ua.wk && ua.wk < 312);
  }

  /* Show the Adobe Express Install dialog
    - Reference: http://www.adobe.com/cfusion/knowledgebase/index.cfm?id=6a253b75
  */
  function showExpressInstall(att, par, replaceElemIdStr, callbackFn) {
    isExpressInstallActive = true;
    storedCallbackFn = callbackFn || null;
    storedCallbackObj = {success:false, id:replaceElemIdStr};
    var obj = getElementById(replaceElemIdStr);
    if (obj) {
      if (obj.nodeName == "OBJECT") { // static publishing
        storedAltContent = abstractAltContent(obj);
        storedAltContentId = null;
      } else { // dynamic publishing
        storedAltContent = obj;
        storedAltContentId = replaceElemIdStr;
      }
      att.id = EXPRESS_INSTALL_ID;
      if (typeof att.width == UNDEF || (!/%$/.test(att.width) && parseInt(att.width, 10) < 310)) { att.width = "310"; }
      if (typeof att.height == UNDEF || (!/%$/.test(att.height) && parseInt(att.height, 10) < 137)) { att.height = "137"; }
      doc.title = doc.title.slice(0, 47) + " - Flash Player Installation";
      var pt = ua.ie && ua.win ? "ActiveX" : "PlugIn",
        fv = "MMredirectURL=" + encodeURI(window.location).toString().replace(/&/g,"%26") + "&MMplayerType=" + pt + "&MMdoctitle=" + doc.title;
      if (typeof par.flashvars != UNDEF) {
        par.flashvars += "&" + fv;
      } else {
        par.flashvars = fv;
      }
      // IE only: when a SWF is loading (AND: not available in cache) wait for the readyState of the object element to become 4 before removing it,
      // because you cannot properly cancel a loading SWF file without breaking browser load references, also obj.onreadystatechange doesn't work
      if (ua.ie && ua.win && obj.readyState != 4) {
        var newObj = createElement("div");
        replaceElemIdStr += "SWFObjectNew";
        newObj.setAttribute("id", replaceElemIdStr);
        obj.parentNode.insertBefore(newObj, obj); // insert placeholder div that will be replaced by the object element that loads expressinstall.swf
        obj.style.display = "none";
        (function() {
          if (obj.readyState == 4) {
            obj.parentNode.removeChild(obj);
          } else {
            setTimeout(arguments.callee, 10);
          }
        })();
      }
      createSWF(att, par, replaceElemIdStr);
    }
  }

  /* Functions to abstract and display alternative content
  */
  function displayAltContent(obj) {
    if (ua.ie && ua.win && obj.readyState != 4) {
      // IE only: when a SWF is loading (AND: not available in cache) wait for the readyState of the object element to become 4 before removing it,
      // because you cannot properly cancel a loading SWF file without breaking browser load references, also obj.onreadystatechange doesn't work
      var el = createElement("div");
      obj.parentNode.insertBefore(el, obj); // insert placeholder div that will be replaced by the alternative content
      el.parentNode.replaceChild(abstractAltContent(obj), el);
      obj.style.display = "none";
      (function() {
        if (obj.readyState == 4) {
          obj.parentNode.removeChild(obj);
        } else {
          setTimeout(arguments.callee, 10);
        }
      })();
    } else {
      obj.parentNode.replaceChild(abstractAltContent(obj), obj);
    }
  }

  function abstractAltContent(obj) {
    var ac = createElement("div");
    if (ua.win && ua.ie) {
      ac.innerHTML = obj.innerHTML;
    } else {
      var nestedObj = obj.getElementsByTagName(OBJECT)[0];
      if (nestedObj) {
        var c = nestedObj.childNodes;
        if (c) {
          var cl = c.length;
          for (var i = 0; i < cl; i++) {
            if (!(c[i].nodeType == 1 && c[i].nodeName == "PARAM") && !(c[i].nodeType == 8)) {
              ac.appendChild(c[i].cloneNode(true));
            }
          }
        }
      }
    }
    return ac;
  }

  /* Cross-browser dynamic SWF creation
  */
  function createSWF(attObj, parObj, id) {
    var r, el = getElementById(id);
    if (ua.wk && ua.wk < 312) { return r; }
    if (el) {
      if (typeof attObj.id == UNDEF) { // if no 'id' is defined for the object element, it will inherit the 'id' from the alternative content
        attObj.id = id;
      }
      if (ua.ie && ua.win) { // Internet Explorer + the HTML object element + W3C DOM methods do not combine: fall back to outerHTML
        var att = "";
        for (var i in attObj) {
          if (attObj[i] != Object.prototype[i]) { // filter out prototype additions from other potential libraries
            if (i.toLowerCase() == "data") {
              parObj.movie = attObj[i];
            } else if (i.toLowerCase() == "styleclass") { // 'class' is an ECMA4 reserved keyword
              att += ' class="' + attObj[i] + '"';
            } else if (i.toLowerCase() != "classid") {
              att += ' ' + i + '="' + attObj[i] + '"';
            }
          }
        }
        var par = "";
        for (var j in parObj) {
          if (parObj[j] != Object.prototype[j]) { // filter out prototype additions from other potential libraries
            par += '<param name="' + j + '" value="' + parObj[j] + '" />';
          }
        }
        el.outerHTML = '<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"' + att + '>' + par + '</object>';
        objIdArr[objIdArr.length] = attObj.id; // stored to fix object 'leaks' on unload (dynamic publishing only)
        r = getElementById(attObj.id);
      } else { // well-behaving browsers
        var o = createElement(OBJECT);
        o.setAttribute("type", FLASH_MIME_TYPE);
        for (var m in attObj) {
          if (attObj[m] != Object.prototype[m]) { // filter out prototype additions from other potential libraries
            if (m.toLowerCase() == "styleclass") { // 'class' is an ECMA4 reserved keyword
              o.setAttribute("class", attObj[m]);
            } else if (m.toLowerCase() != "classid") { // filter out IE specific attribute
              o.setAttribute(m, attObj[m]);
            }
          }
        }
        for (var n in parObj) {
          if (parObj[n] != Object.prototype[n] && n.toLowerCase() != "movie") { // filter out prototype additions from other potential libraries and IE specific param element
            createObjParam(o, n, parObj[n]);
          }
        }
        el.parentNode.replaceChild(o, el);
        r = o;
      }
    }
    return r;
  }

  function createObjParam(el, pName, pValue) {
    var p = createElement("param");
    p.setAttribute("name", pName);
    p.setAttribute("value", pValue);
    el.appendChild(p);
  }

  /* Cross-browser SWF removal
    - Especially needed to safely and completely remove a SWF in Internet Explorer
  */
  function removeSWF(id) {
    var obj = getElementById(id);
    if (obj && obj.nodeName == "OBJECT") {
      if (ua.ie && ua.win) {
        obj.style.display = "none";
        (function() {
          if (obj.readyState == 4) {
            removeObjectInIE(id);
          } else {
            setTimeout(arguments.callee, 10);
          }
        })();
      } else {
        obj.parentNode.removeChild(obj);
      }
    }
  }

  function removeObjectInIE(id) {
    var obj = getElementById(id);
    if (obj) {
      for (var i in obj) {
        if (typeof obj[i] == "function") {
          obj[i] = null;
        }
      }
      obj.parentNode.removeChild(obj);
    }
  }

  /* Functions to optimize JavaScript compression
  */
  function getElementById(id) {
    var el = null;
    try {
      el = doc.getElementById(id);
    }
    catch (e) {}
    return el;
  }

  function createElement(el) {
    return doc.createElement(el);
  }

  /* Updated attachEvent function for Internet Explorer
    - Stores attachEvent information in an Array, so on unload the detachEvent functions can be called to avoid memory leaks
  */
  function addListener(target, eventType, fn) {
    target.attachEvent(eventType, fn);
    listenersArr[listenersArr.length] = [target, eventType, fn];
  }

  /* Flash Player and SWF content version matching
  */
  function hasPlayerVersion(rv) {
    var pv = ua.pv, v = rv.split(".");
    v[0] = parseInt(v[0], 10);
    v[1] = parseInt(v[1], 10) || 0; // supports short notation, e.g. "9" instead of "9.0.0"
    v[2] = parseInt(v[2], 10) || 0;
    return (pv[0] > v[0] || (pv[0] == v[0] && pv[1] > v[1]) || (pv[0] == v[0] && pv[1] == v[1] && pv[2] >= v[2])) ? true : false;
  }

  /* Cross-browser dynamic CSS creation
    - Based on Bobby van der Sluis' solution: http://www.bobbyvandersluis.com/articles/dynamicCSS.php
  */
  function createCSS(sel, decl, media, newStyle) {
    if (ua.ie && ua.mac) { return; }
    var h = doc.getElementsByTagName("head")[0];
    if (!h) { return; } // to also support badly authored HTML pages that lack a head element
    var m = (media && typeof media == "string") ? media : "screen";
    if (newStyle) {
      dynamicStylesheet = null;
      dynamicStylesheetMedia = null;
    }
    if (!dynamicStylesheet || dynamicStylesheetMedia != m) {
      // create dynamic stylesheet + get a global reference to it
      var s = createElement("style");
      s.setAttribute("type", "text/css");
      s.setAttribute("media", m);
      dynamicStylesheet = h.appendChild(s);
      if (ua.ie && ua.win && typeof doc.styleSheets != UNDEF && doc.styleSheets.length > 0) {
        dynamicStylesheet = doc.styleSheets[doc.styleSheets.length - 1];
      }
      dynamicStylesheetMedia = m;
    }
    // add style rule
    if (ua.ie && ua.win) {
      if (dynamicStylesheet && typeof dynamicStylesheet.addRule == OBJECT) {
        dynamicStylesheet.addRule(sel, decl);
      }
    } else {
      if (dynamicStylesheet && typeof doc.createTextNode != UNDEF) {
        dynamicStylesheet.appendChild(doc.createTextNode(sel + " {" + decl + "}"));
      }
    }
  }

  function setVisibility(id, isVisible) {
    if (!autoHideShow) { return; }
    var v = isVisible ? "visible" : "hidden";
    if (isDomLoaded && getElementById(id)) {
      getElementById(id).style.visibility = v;
    } else {
      createCSS("#" + id, "visibility:" + v);
    }
  }

  /* Filter to avoid XSS attacks
  */
  function urlEncodeIfNecessary(s) {
    var regex = /[\\\"<>\.;]/;
    var hasBadChars = regex.exec(s) != null;
    return hasBadChars && typeof encodeURIComponent != UNDEF ? encodeURIComponent(s) : s;
  }

  /* Release memory to avoid memory leaks caused by closures, fix hanging audio/video threads and force open sockets/NetConnections to disconnect (Internet Explorer only)
  */
  var cleanup = function() {
    if (ua.ie && ua.win) {
      window.attachEvent("onunload", function() {
        // remove listeners to avoid memory leaks
        var ll = listenersArr.length;
        for (var i = 0; i < ll; i++) {
          listenersArr[i][0].detachEvent(listenersArr[i][1], listenersArr[i][2]);
        }
        // cleanup dynamically embedded objects to fix audio/video threads and force open sockets and NetConnections to disconnect
        var il = objIdArr.length;
        for (var j = 0; j < il; j++) {
          removeSWF(objIdArr[j]);
        }
        // cleanup library's main closures to avoid memory leaks
        for (var k in ua) {
          ua[k] = null;
        }
        ua = null;
        for (var l in swfobject) {
          swfobject[l] = null;
        }
        swfobject = null;
      });
    }
  }();

  return {
    /* Public API
      - Reference: http://code.google.com/p/swfobject/wiki/documentation
    */
    registerObject: function(objectIdStr, swfVersionStr, xiSwfUrlStr, callbackFn) {
      if (ua.w3 && objectIdStr && swfVersionStr) {
        var regObj = {};
        regObj.id = objectIdStr;
        regObj.swfVersion = swfVersionStr;
        regObj.expressInstall = xiSwfUrlStr;
        regObj.callbackFn = callbackFn;
        regObjArr[regObjArr.length] = regObj;
        setVisibility(objectIdStr, false);
      } else if (callbackFn) {
        callbackFn({success:false, id:objectIdStr});
      }
    },

    getObjectById: function(objectIdStr) {
      if (ua.w3) {
        return getObjectById(objectIdStr);
      }
    },

    embedSWF: function(swfUrlStr, replaceElemIdStr, widthStr, heightStr, swfVersionStr, xiSwfUrlStr, flashvarsObj, parObj, attObj, callbackFn) {
      var callbackObj = {success:false, id:replaceElemIdStr};
      if (ua.w3 && !(ua.wk && ua.wk < 312) && swfUrlStr && replaceElemIdStr && widthStr && heightStr && swfVersionStr) {
        setVisibility(replaceElemIdStr, false);
        addDomLoadEvent(function() {
          widthStr += ""; // auto-convert to string
          heightStr += "";
          var att = {};
          if (attObj && typeof attObj === OBJECT) {
            for (var i in attObj) { // copy object to avoid the use of references, because web authors often reuse attObj for multiple SWFs
              att[i] = attObj[i];
            }
          }
          att.data = swfUrlStr;
          att.width = widthStr;
          att.height = heightStr;
          var par = {};
          if (parObj && typeof parObj === OBJECT) {
            for (var j in parObj) { // copy object to avoid the use of references, because web authors often reuse parObj for multiple SWFs
              par[j] = parObj[j];
            }
          }
          if (flashvarsObj && typeof flashvarsObj === OBJECT) {
            for (var k in flashvarsObj) { // copy object to avoid the use of references, because web authors often reuse flashvarsObj for multiple SWFs
              if (typeof par.flashvars != UNDEF) {
                par.flashvars += "&" + k + "=" + flashvarsObj[k];
              } else {
                par.flashvars = k + "=" + flashvarsObj[k];
              }
            }
          }
          if (hasPlayerVersion(swfVersionStr)) { // create SWF
            var obj = createSWF(att, par, replaceElemIdStr);
            if (att.id == replaceElemIdStr) {
              setVisibility(replaceElemIdStr, true);
            }
            callbackObj.success = true;
            callbackObj.ref = obj;
          } else if (xiSwfUrlStr && canExpressInstall()) { // show Adobe Express Install
            att.data = xiSwfUrlStr;
            showExpressInstall(att, par, replaceElemIdStr, callbackFn);
            return;
          } else { // show alternative content
            setVisibility(replaceElemIdStr, true);
          }
          if (callbackFn) { callbackFn(callbackObj); }
        });
      } else if (callbackFn) { callbackFn(callbackObj); }
    },

    switchOffAutoHideShow: function() {
      autoHideShow = false;
    },

    ua: ua,

    getFlashPlayerVersion: function() {
      return { major:ua.pv[0], minor:ua.pv[1], release:ua.pv[2] };
    },

    hasFlashPlayerVersion: hasPlayerVersion,

    createSWF: function(attObj, parObj, replaceElemIdStr) {
      if (ua.w3) {
        return createSWF(attObj, parObj, replaceElemIdStr);
      } else {
        return undefined;
      }
    },

    showExpressInstall: function(att, par, replaceElemIdStr, callbackFn) {
      if (ua.w3 && canExpressInstall()) {
        showExpressInstall(att, par, replaceElemIdStr, callbackFn);
      }
    },

    removeSWF: function(objElemIdStr) {
      if (ua.w3) {
        removeSWF(objElemIdStr);
      }
    },

    createCSS: function(selStr, declStr, mediaStr, newStyleBoolean) {
      if (ua.w3) {
        createCSS(selStr, declStr, mediaStr, newStyleBoolean);
      }
    },

    addDomLoadEvent: addDomLoadEvent,

    addLoadEvent: addLoadEvent,

    getQueryParamValue: function(param) {
      var q = doc.location.search || doc.location.hash;
      if (q) {
        if (/\?/.test(q)) { q = q.split("?")[1]; } // strip question mark
        if (param == null) {
          return urlEncodeIfNecessary(q);
        }
        var pairs = q.split("&");
        for (var i = 0; i < pairs.length; i++) {
          if (pairs[i].substring(0, pairs[i].indexOf("=")) == param) {
            return urlEncodeIfNecessary(pairs[i].substring((pairs[i].indexOf("=") + 1)));
          }
        }
      }
      return "";
    },

    // For internal usage only
    expressInstallCallback: function() {
      if (isExpressInstallActive) {
        var obj = getElementById(EXPRESS_INSTALL_ID);
        if (obj && storedAltContent) {
          obj.parentNode.replaceChild(storedAltContent, obj);
          if (storedAltContentId) {
            setVisibility(storedAltContentId, true);
            if (ua.ie && ua.win) { storedAltContent.style.display = "block"; }
          }
          if (storedCallbackFn) { storedCallbackFn(storedCallbackObj); }
        }
        isExpressInstallActive = false;
      }
    }
  };
}();

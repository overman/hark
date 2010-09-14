dojo.provide("widgets.reactionGameEngine");
dojo.require("dojox.timing._base");
dojo.require("dijit.Dialog");
dojo.require("dijit.form.Button");
dojo.require("dijit.layout.BorderContainer");
dojo.require("dijit._Templated");
dojo.require("dijit._Widget");
dojo.require("dojo.cache");
dojo.require("dijit._base.manager");


dojo.declare('widgets.reactionGameEngine', [dijit._Widget, dijit._Templated], {

    templateString: dojo.cache("HarkTheSound/widgets", "templates/reactionGameEngineTemplate.html"),

    widgetsInTemplate: true,

    hark: {}, 
    
    gameData: {}, 

    constructor: function() {
        this._loadingDialog = this._showDialog("Loading Screen", "The game is loading.");   
        this._loadingDialog._alreadyInitialized=false;    //user can not close now 

        //fixed for all reaction games???
        this._numberOfMilestonesHit = 0;
        this.score = 1000;    //initial score
        this.waitingForResponse = false;    //waiting for user input

        this.lastSoundPlayed = "";	
        this._gameIsPaused = false;
        this._gameIsOver = false;    //boolean for controlling pause validity
        this._timeSpentOnPause = 0;
        this._pauseStartTime = 0;
        this._currentlyReadingScore = false;
        this._dontFinishRead = false;

        var def = uow.getAudio({defaultCaching: true});    //get JSonic
        def.then(dojo.hitch(this, function(audio) {
            this._audio = audio;
            var constructorHandle = dojo.subscribe("namingGameEngineStartup", dojo.hitch(this, function(message){
                if (message == "postCreate_ready" && !this.gameStarted) {
                    dojo.unsubscribe(constructorHandle);
                    this._doInstructions();
                }
            }));
            dojo.publish("namingGameEngineStartup", ["constructor_ready"]);
        })); 
    },

    postCreate: function() {
        this.inherited(arguments);
         //load screen
        this.connect(dojo.global, 'onresize', 'resizeGameImage');
        
        this.goodSounds = this.gameData.Good_Sounds;
        this.badSounds = this.gameData.Bad_Sounds;
        this.responseTime = this.gameData.Reaction_Time;
        this._gameLength = this.gameData.Game_Time_Length;
        this.gamePlayImages = this.gameData.Game_Play_Images;
        this._changeGameImage(this._oneOf(this.gamePlayImages));
        dojo.removeClass(this.gameImage, 'hidden');
        this.rewardSounds = this.gameData.Reward_Sounds;
        this.missedGoodMessages = this.gameData.onMissGood_Messages; 
        this.wrongHitRight = this.gameData.onHitRightButWrong_Messages;
        this.wrongHitLeft = this.gameData.onHitLeftButWrong_Messages;
        this.badWasHit = this.gameData.onBadHit_Messages;
        this.pauseImages = this.gameData.Pause_Screen_Images; 
        this.pauseMessages = this.gameData.Pause_Screen_Messages;   
        this.endImages = this.gameData.End_Game_Images;    
        this.instructions = this.gameData.Instructions;
        this.endSounds = this.gameData.End_Game_Sounds;
        var postCreateHandle = dojo.subscribe("namingGameEngineStartup", dojo.hitch(this, function(message){
            if (message == "constructor_ready" && !this.gameStarted) {
                dojo.unsubscribe(postCreateHandle);
                this._doInstructions();
            }
        }));
        dojo.publish("namingGameEngineStartup", ["postCreate_ready"]);
    },

    // pops up game "instructions". 
    // @todo: should let user know what the good and bad sounds are
    _doInstructions: function() { 
        this._audio.say({text: this.instructions}).callBefore(dojo.hitch(this, function() {  
            this._loadingDialog._alreadyInitialized=true;    //so that .hide will have effect   
            this._loadingDialog.hide();
            var instructionsDialog = this._showDialog("Instructions", this.instructions);      
            dojo.connect(instructionsDialog, 'hide', dojo.hitch(this, function() {
                this.exitedInstructions = true;
                this._audio.stop().callAfter(dojo.hitch(this, function() {//clears queue   
                    this._doneWithInitialScreens(); // have to wait or may trample gameplay sounds
                }));              
            }));
            
            this.readOffSounds();
        }));
    },
    
    //  reads off the good and bad sounds during instructions.
    //  This is a first shot at reading off the good and bad sounds. 
    readOffSounds: function() {
        var goodSoundsCopy = dojo.map(this.goodSounds, function(item) {return item;});
        var badSoundsCopy = dojo.map(this.badSounds, function(item) {return item;}); 
        if(!this.exitedInstructions) {           
            this._audio.say({text: "Here are the good sounds. You want to hit these."});
            while (goodSoundsCopy.length) { //just queuing up
                //don't add anymore to queue if exited. queue cleared on exit
                if (this.exitedInstructions) {} 
                else{
                    var sound = goodSoundsCopy.pop();
                    this._audio.say({text: "Here's the next good sound."});
                    this._audio.play({url: sound});                 
                } 
            }
            if(!this.exitedInstructions){// then do the bad ones
                this._audio.say({text: "Here are the bad sounds. You do not want to hit these."});
                while (badSoundsCopy.length) { //just queuing up
                    //don't add anymore to queue if exited. queue cleared on exit
                    if (this.exitedInstructions) {} 
                    else{
                        var sound = badSoundsCopy.pop();
                        this._audio.say({text: "Here's the next bad sound."});
                        this._audio.play({url: sound});                 
                    } 
                }

            }          
        }
    },

    // called when loading and instruction screens are done. final setup before running game
    _doneWithInitialScreens: function() {
        this._exitedInstructions = true;
		this._audio.stop();
        dojo.connect(dojo.global, 'onkeydown', this, '_analyzeKey');
        dojo.connect(dojo.global, 'onkeyup', this, '_removeKeyDownFlag');
        this._keyHasGoneUp = true;
       // dojo.connect(dijit.byId("creditsButton"), "onClick", this, "_showCredits");
        //this._creditsDialog = dijit.byId("creditsDialog");
        //dojo.connect(this._creditsDialog, 'hide', this, '_restartGamePlay'); 	
        var d = new Date();
        this._startTime = d.getTime();
        this._run();
        
    },
   
    // from first brower version of coins and barrels.
    // @todo: individual credits will not be a part of each game
    _showCredits: function() {
        this._creditsDialog.show();
        this._stopGamePlayPlusTime("this._showCredits"); 	
        this.timer.stop();    //edge case		 
    },

    // create, show, and return Dialog
    _showDialog: function(theTitle, text) {
        var d = new dijit.Dialog({
            title: theTitle,
            //need a div to keep title bar outside of scrolled region
            content: "<div style=\"width: 500px; height: 100px; overflow: auto; padding-left: 25px; padding-right: 25px; text-align: left;\">" + text + "</div>",       
        });
        d.show();
        return d;
    },

    //  run a round
    _run: function(caller) {
        //caller	
        //var myCaller = caller;
        //console.log("this._run() called by: " + myCaller);
        dojo.query("#creditsDialog").removeClass("hidden");
        var now = new Date();
        this._roundStartTime = now.getTime();    //round timer -- used for scoring
        var soundPicked = this._pickSound();
        this.timer = new dojox.timing.Timer();    //timer for timing the user response 
        this.timer.setInterval(this.responseTime);
		
        dojo.connect(this.timer,'onTick', this, '_timeIsUp');    // don't need to connect if override onTick
        this.lastSoundPlayed = soundPicked;
        this._responseSoundPlayed = false;
        if (this._gameIsPaused || this._gameIsOver) {}    //last time to catch end case of pause and end during sound play
        else {
            this.waitingForResponse = true;    //here to make stop calls useful
            this._audio.play({url : soundPicked }).callAfter(dojo.hitch(this, function() 
            { 
                //last last chance sound will have played but we can still stop train wreck
                if (this._gameIsPaused || this._gameIsOver){}    
                else{
                    if (this._responseSoundPlayed == true) {}	//then catch this edge case
					else{
                        this.timer.start();    //start counting now
                    }
                }
            }));
        }
    },

    //picks one sound from the union of this.goodSounds and this.badSounds, advantage given to coin 
    _pickSound: function() {    
        if (this._soundIsBad(this.lastSoundPlayed)) {
            //then pick a coin
            var sound = this._oneOf(this.goodSounds);
        }
        else{
            var number=Math.random();
            if (number <= 0.7) { //gives advantage to coin showing up over barrel
                var sound = this._oneOf(this.goodSounds);
            }
            else {
                var sound = this._oneOf(this.badSounds);
            }
        }
        return sound;
    },
    
    // "key" functions to be pulled out to uow later
    _keyIsLeftArrow: function(keyStroke) {    //boolean is key pressed left arrow
        if (keyStroke.keyCode == dojo.keys.LEFT_ARROW) {
            return true;
        }
        else {
            return false;
        }
    },

    _keyIsRightArrow: function(keyStroke) {    //boolean is key pressed right arrow
        if (keyStroke.keyCode == dojo.keys.RIGHT_ARROW){
            return true;
        }
        else {
            return false;
        }
    },

    //boolean is sound passed in bad
    _soundIsBad: function(sound) { 
        var wasBad = false;
        dojo.forEach(this.badSounds, dojo.hitch(this, function(badSound) {
            if (badSound == sound) {
                wasBad = true;
            }
        }));
        if (wasBad) {
            return true; 
        }
        else {
            return false;
        }
    },

    //boolean is sound chosen on left side
    _soundIsOnLeft: function(sound) {    
        if (sound.charAt(sound.length-1) == 'L') {
            return true;
        }
        else {
            return false;
        }
    },
	
    // called when user makes a bad move in game
    _badMove: function(caller, misstep) { 
        // caller
        //var myCaller = caller;
        //console.log("this._badMove() called by: " + myCaller);

        //have to hitch to get correct "this" to anonymous func
        switch (misstep)
        {
        case "didntGetAGood": 
            var words = this._oneOf(this.missedGoodMessages);
            break;
        case "hitABad": 
            var words = this._oneOf(this.badWasHit);
            break;
        case "goodWasOnRight":
            var words = this._oneOf(this.wrongHitLeft);
            break;
        case "goodWasOnLeft": 
            var words = this._oneOf(this.wrongHitRight);
            break;
        }
        this._audio.say({text : words }).callAfter(dojo.hitch(this, function() 
            {
                if (this._gameHasEnded()) {    //if time has passed call for end
                    this._endGame();
                }
                else {	
                    if (this._gameIsPaused){    //then paused after badMove began so do nothing
                    }
                    else {    //continue running 
                        this._run("anonymous function within this._badMove()"); 
                    }
                }
            }));  
        this.score = this.score - 10;  //should loose more points???
        this._updateScoreDisplay();
    },

    // called when user makes correct move in game
    _goodMove: function(caller) { 
        //caller
        //var myCaller = caller;
        //console.log("this._goodMove() called by: " + myCaller);
        var dayForScore = new Date();
        var currentTimeForScore = dayForScore.getTime();
        var sound = this._oneOf(this.rewardSounds);
        this._audio.play({url : sound}).callAfter(dojo.hitch(this, function() 
            {
                if (this._gameHasEnded()) {    //if time has passed call for end
                    this._endGame();
                }
                else if(this._hitAScoreMilestone()) {
                    this._readScore();                
                }
                else {	
                    if (this._gameIsPaused){    //then paused after goodMove began so do nothing
                    }
                    else {    //continue running 
                        this._run("anonymous function within this._goodMove()"); 
                    }
                }			
            })); 

        //score update
        var difference = (currentTimeForScore - this._roundStartTime)/1000;
        if (difference < 2) {    // response made in less than 2 seconds
            this.score += Math.round(-20000*difference + 52939);
        }
        else {
            this.score += 12939;
        }
        this._updateScoreDisplay();
    },

    //  called when a score milestone hit. Score milestones are occurances during game play
    //  during which the user score is read out. To change how often called, change 
    //  "scoreMilstoneSize" below
    //  @return boolean was milestone hit
    _hitAScoreMilestone : function() {
        var scoreMilestoneSize = 100000;
        if ((this.score - (scoreMilestoneSize*(this._numberOfMilestonesHit+1))) >= 0) {
            this._numberOfMilestonesHit++;
            return true;
        }
        else {
            return false;
        }
    },

    //  called when the user has surpassed the allowed response time without 
    //  making any moves
    _timeIsUp: function() {
        this.timer.stop();     // stop it from continuing to another interval
        if (!this.waitingForResponse) {	
            //then timer called _timeIsUp after we started analyzing a key
            //or while in pause menu
            //so do nothing
        }
        else if (this._soundIsBad(this.lastSoundPlayed)) { 
            this.waitingForResponse = false; // stop accepting now
            this._goodMove("this._timeIsUp()");	// only way a time out is good is if a bomb just played
        }
        else {
            this.waitingForResponse = false; // stop accepting now
            this._badMove("this._timeIsUp()", "didntGetAGood");
        }
		
    },
	
    //  function for handling user input
    _analyzeKey: function(evt){	
        if (this._keyHasGoneUp) {
            this._keyHasGoneUp = false;
            if (this._keyIsLeftArrow(evt) || this._keyIsRightArrow(evt)) { //then we want to see if correct key hit
                evt.preventDefault();
                if (this.waitingForResponse) {    // then check to see if correct 
                    this._responseSoundPlayed = true;    //haven't really yet but catches deferred bug in "run"
                    this.waitingForResponse = false;    //don't analyze any new input
                    this.timer.stop();    //aren't waiting for a response anymore
                    if (this._soundIsBad(this.lastSoundPlayed)) { //then shouldn't have hit anything
                        this._badMove("this._analyzeKey()", "hitABad");						
                    }
                    else if (this._keyIsLeftArrow(evt) && !this._soundIsOnLeft(this.lastSoundPlayed)) {
                        this._badMove("this._analyzeKey()", "goodWasOnRight");
                    }
                    else if(this._keyIsRightArrow(evt) && this._soundIsOnLeft(this.lastSoundPlayed)) {
                        this._badMove("this._analyzeKey()", "goodWasOnLeft");
                    }
                    else {	//hit the correct button
                        this._goodMove("this._analyzeKey()");
                    }
                }
                else {} //ignore the input
            }
            else if ((evt.keyCode == 80) && !(this._gameIsOver)) {	//p button
                evt.preventDefault();
                if (this._currentlyReadingScore) {
                    this._dontFinishRead = true; 
                    this._pause();
                }
                else if (this._gameIsPaused) {    //restart gameplay
                    this._restartGamePlay("Analyzing 'P' Key");
                }
                else {    //otherwise pause it
                    this._pause();
                }
            }
            else {}    //ignore the input
        }
    },
	
    //  called to stop game play, such as during pause or sound credit pop up
    //  "PlusTime" refers to the fact that it keeps track of how much time the
    //  user spends in the "paused" mode. That way, since there is a game time
    //  length after which the game ends, pausing or opening credits dialog 
    //  does not take away from game play time.
    _stopGamePlayPlusTime: function(caller) {
        //caller
        //console.log("this._stopGamePlayPlusTime called by: " + caller);
        this._gameIsPaused = true;   //stops the play sound 		
        this.timer.stop();
        if (this._currentlyReadingScore) {
            this._dontFinishRead = true;
        }
        this._audio.stop();
        this.waitingForResponse = false;    //will be set back to true by this._run() call
        var day = new Date();
        var startPause = day.getTime();
        this._pauseStartTime = startPause;
    },
	
    //  for controlling key repeats
    _removeKeyDownFlag: function() {
        this._keyHasGoneUp = true; 
	},
	
    //  called when coming off a pause
    _restartGamePlay: function(caller) {
        //caller
        //var myCaller = caller;
        //console.log("this._restartGamePlay called by: " + myCaller);
		
        this._currentlyReadingScore = false;
        this._audio.stop();
        var now = new Date();
        var endPause = now.getTime();
        this._timeSpentOnPause += (endPause - this._pauseStartTime);
        if (this._gameIsOver) {    //then already gone through endGame sequence once 
            //so do nothing
        }
        else if (this._gameHasEnded()) {    //check if time has surpassed then we're done
            this._endGame();
        }
        else {    //run again
            this._gameIsPaused = false;
            this._changeGameImage(this._oneOf(this.gamePlayImages));
            this._run("this._restartGamePlay");    //just start over with a new sound and timer
        }
        
    },

    // pause sequence for the game
    _pause: function() {
        this.waitingForResponse = false;    //will be set back to true by this._run() call
        this._stopGamePlayPlusTime("this._pause");
        this.timer.stop();    //edge case
	
        var pauseMessage = this._oneOf(this.pauseMessages);
        this._audio.say({text : pauseMessage}).callBefore(dojo.hitch(this, function() 
        {
            this._changeGameImage(this._oneOf(this.pauseImages));
        }));
    },
    
    // read off user score
    _readScore: function() {
        if (this._gameIsPaused) {} //dont do it
        else{
            this._stopGamePlayPlusTime("this._readScore()");
            var congratsOptions = [ "Congratulations! ", "Nice Job! ", "Fantastic! ", "Awesome! ", "Great Work! "];
            this._currentlyReadingScore = true;
            this._audio.say({text: congratsOptions[Math.floor(Math.random()*congratsOptions.length)] + "You hit a score checkpoint, your score is now" + String(this.score)}).callAfter(dojo.hitch(this, function() 
                {
                    if (this._dontFinishRead) {
                        this._currentlyReadingScore = false;
                        this._dontFinishRead = false;
                    }
                    else {
                        this._restartGamePlay("this._readScore()"); 
                    }
                }));
        }
    },

    //  used for changing game Image. resizing is done in this.resizeGameImage. This is for getting
    //  the proper aspect ratio upon insertion of a new image src    
    _changeGameImage: function(imageData) {
        this.currentImageData = imageData;
        this.findVisibleImageArea();
        //get rid of current image or else you will see it size to next images' dimensions
        dojo.addClass(this.gameImage, "hidden");
        this.gameImage.src = "";
        
        //get image ratio
        var imageRatio = this.currentImageData.width/this.currentImageData.height;
        var windowRatio = this.availableWidth/this.availableHeight;
        if ((this.currentImageData.height == 0) || ( this.availableHeight == 0)) {
            this.gameImage.style.height = "0px";
            this.gameImage.style.width = "0px";
        }
        else if (windowRatio < 0) {
            //then window sized down really really small, div's have reorganized
            this.gameImage.style.height = "0px";
            this.gameImage.style.width = "0px";
        }
        else if (windowRatio >= imageRatio) {
            //set by height
            this.gameImage.style.height = this.availableHeight + "px";
            this.gameImage.style.width = "auto";
        }
        else {
            //set by width
            this.gameImage.style.width = this.availableWidth + "px";
            this.gameImage.style.height = "auto";
        }
        //now change image source
        dojo.removeClass(this.gameImage, "hidden");
        this.gameImage.src = this.currentImageData.url;  
        console.log("availablewidth: ", this.availableWidth, " availableHeight: ", this.availableHeight);
        
    },
    
    //  finds available space for game image and sets this.availableWidth and this.availableHeight
    findVisibleImageArea: function () {
        this.availableWidth = dojo.global.innerWidth - 25;   //25 is for padding and div's
        var rewardTopPosition = this.hark.getElementTopPosition(this.gameImage);
        this.availableHeight = dojo.global.innerHeight - rewardTopPosition - 25 ; //25 is for padding
        //console.log("gameNode: ", this.hark.getElementTopPosition(dojo.byId("gameGoesHere")));
    },
    
    //  works correctly if an image is already loaded and has established style height/width
    //  for inserting new image use  this._changeGameImage()
    resizeGameImage: function () {
        this.findVisibleImageArea();
        //get image ratio 
        var imageRatio = this.currentImageData.width/this.currentImageData.height;
        var windowRatio = this.availableWidth/this.availableHeight;
        if ((this.currentImageData.height == 0) || ( this.availableHeight == 0)) {
            this.gameImage.style.height = "0px";
            this.gameImage.style.width = "0px";
        }
        else if (windowRatio < 0) {
            //then window sized down really really small, div's have reorganized
            this.gameImage.style.height = "0px";
            this.gameImage.style.width = "0px";
        }
        else if (windowRatio >= imageRatio) {
            //set by height
            this.gameImage.style.height = this.availableHeight + "px";
            this.gameImage.style.width = "auto";
        }
        else {
            //set by width
            this.gameImage.style.width = this.availableWidth + "px";
            this.gameImage.style.height = "auto";
        }
    },   
    

    //just update innerHTML
    _updateScoreDisplay: function() {    
        this.scoreValue.innerHTML = this.score;
    },

    //  @return boolean if allotted for game has passed
    _gameHasEnded: function() {    
        var d = new Date();    //get new date and time
        var currentTime = d.getTime();
        if ((currentTime - this._startTime - this._timeSpentOnPause) >= this._gameLength) {
            return true;
        }
        else{
            return false; 
        }	
    },

    //  randomizes an array, does not return an arrray. Mutates the one passed in
    _randomize: function(array) {
        var i = array.length;
        if ( i == 0 ) return false;
        while ( --i ) {
            var j = Math.floor( Math.random() * ( i + 1 ) );
            var tempi = array[i];
            var tempj = array[j];
            array[i] = tempj;
            array[j] = tempi;
        }
    },
	
    //  returns one element of passed in array randomly without mutating the passed in
    _oneOf: function(array) {
        var copy = dojo.map(array, function(item) {return item;});
        this._randomize(copy);
        var toReturn = copy.pop();
        return toReturn;
    },
    
    //  current just stops the functionality of the game
    _endGame: function() {
        this._gameIsOver = true;    //disables pause
        this.waitingForResponse = false;    //ignore all keys for purpose of game
        this._changeGameImage(this._oneOf(this.endImages));
        this.ScoreString.innerHTML = "Your final score is: "; //change wording to final score
        this._audio.play({url: this._oneOf(this.endSounds), channel: "endGame"});
        //Say final score
        this._audio.say({text: "Congratulations! Your final score is" + String(this.score)});
    },
    
    uninitialize: function() {
        dojo.unsubscribe(this.audioSub);
        var handle = dojo.subscribe("gameExit", dojo.hitch(this, function(){
            dojo.unsubscribe(handle);
        }));
        dojo.publish("gameExit", ["widgetDestroyed"]);
    },
    
    //  this was pulled out to allow hark frame to kill the game -- hashing
    endGame: function() {
        this._audio.stop();
        this._waitingForResponse = false;
        this.promptNode.innerHTML = "Prompt: ";
        this.choiceNode.innerHTML = "Choice: "
        //add node back in case another game instantiated
        //var actionNode = dojo.byId("actionPane");
        //dojo.place("<div id='gameGoesHere'></div>", actionNode );
        this.destroyRecursive();
    }, 
});

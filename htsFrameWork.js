dojo.provide('htsFrameWork');
dojo.require('dojo.parser');
dojo.require("dojo.hash");

dojo.declare('htsFrameWork', null, {
    constructor: function() {
        this.currentlyHashing = false;
        this._buildHomePageGames();
    },

    //  gets the hash for games in the HomePageGames.json
    //  soon to be taken over by new architecture 
    _buildHomePageGames: function() {
        //get game list data -- right now sepearate file for games that go on the home page
        var gameRequest = {
            url : "HomePageGames.json",
            handleAs : 'json',
            preventCache: true,
            error: function(error) {console.log(error);}
        };
        var dataDef = dojo.xhrGet(gameRequest);
        dataDef.addCallback(dojo.hitch(this, function(data) { 
            this.gameData = data;
            var homeGames = this.gameData.Games;
            var homeGameData = [];
            dojo.forEach(homeGames, dojo.hitch(this, function(game) {
                var name = game.Name;
                homeGameData.push([game.url, game.Name]);
            }));
            this.placeHomePageGames(homeGameData);
        }));
    },
    
    placeHomePageGames: function(data) {
        //build 4*5 table and fill in as many games as possible
        var table = dojo.create("table", { id: "gameTable", border: "1"}, "gameGoesHere", "before");
        var endTable = false;
        this.data = data;
        for (var index=0;index<=3;index++) {
            var row = dojo.create("tr", null, table);
            dojo.forEach([1,2,3,4,5], dojo.hitch(this, function(number) {
                var gameData = this.data.pop();   
                if (gameData) {                     
                    var data = dojo.create("td",{style :{padding: "5px"}}, row);
                    dojo.create("a", { innerHTML: gameData[1], href: gameData[0], target: "_blank" }, data);
                }
                else{   //no more games, fill out row
                    var endTable = true;
                    dojo.create("td",null, row);
                }
            }));
            if(endTable) {
               break;
            }
        }
    },
    
});

dojo.ready(function() {
    var app = new htsFrameWork();        
});

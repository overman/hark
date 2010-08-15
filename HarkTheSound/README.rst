Overview
=============

Current implementation for running the downloadable version of Hark the Sound in the browser.

Crude Hierarchy Description
=============

Pointing your browser to the HarkTheSound directory loads the framework. Index file contains the home page layout as well as the options menu structure. The index loads 'harkTheSound.js' which is the framework for loading the games. 

Each game type has a corresponding game engine in the 'widgets' directory. Currently the home page loads a table of links to the games. The link names are currently just the hashes that will load upon selecting one of the links. The hash value tells framework which game to load. 

Originally this version of hark functioned like the downloadable version. The user first had to move through the game types and pick one. Then the user was presented with the available games to play within in that type. The user selected one and the game loaded. Therein, the hash loading style was an afterthought and there remains much in the code that no longer serves the game, most is noted within. 

Also in the framework there is a fair amount of code not used in the framework but used by all the game engines. It was put there as a first step of possibly pulling some of it onto UOW for more games to use as well. 

The framework listens for options updates which are prompted by the user pressing the submit button in the options menu. The framework publishes the resulting data for the game engine to utilize. 

Other Notes
=============

None of the images or sounds are up here. 

/**
 * Of course you can cheat. Where's the fun in that?
 * 
 * This code is not pretty and I'm okay with that.
 * http://www.isaacsukin.com/news/2012/01/07/todo-make-code-prettier
 */

var playerIcon = '<img id="player" alt="Player" src="images/player-2.png" height="30" width="30" />';
var enemyIcon = '<img class="enemy" alt="Dalek" src="images/enemy.png" height="30" width="30" />';
var pileIcon = '<img class="pile" alt="Pile" src="images/pile.png" height="30" width="30" />';
var playerX = 10, playerY = 10,
    rCells = 20, cCells = 20, origRows = 20, origCols = 20,
    bombs = 1, safeTeleports = 1, lives = 0,
    level = 1, score = 0, highScore = 0,
    expandLevel = 20;
var enemies = [], piles = [], powerups = [];
var messageFadeTimerA, messageFadeTimerB;
var gameOver = false, shielded = false;
var directionalClasses = ['ul', 'ml', 'll', 'um', 'mm', 'lm', 'ur', 'mr', 'lr'],
    powerupTypes = ['bomb', 'life', 'shield', 'teleporter-safe'];

$(document).ready(function() {
	// Track the number of rows and columns.
	cCells = origCols = $('#game tr:first td').length;
	rCells = origRows = $('#game tr').length;
	// Add classes denoting the rows/columns.
	$.each($('tr'), function(i, e) {
		$(this).addClass('row-'+ (i+1));
		$.each($(this).find('td'), function(j, f) {
			$(this).addClass('column-'+ (j+1));
		});
	});
	// Assign action handlers.
	var submitButton = null;
	$('form.nosubmit').submit(function(e) {
		if (submitButton == 'teleport') {
			teleport();
		}
		else if (submitButton == 'bomb') {
			bomb();
		}
		else if (submitButton == 'restart') {
			restart();
		}
		else if (submitButton == 'wait') {
			standStill();
		}
		e.preventDefault();
	}).on('keyup mouseup', function(e) {
		submitButton = e.target.name;
	});
	// Assign key commands.
	$(document).bind('keyup', 'b d .', bomb);
	$(document).bind('keyup', 't f 0 space', teleport);
	$(document).bind('keyup', 'w +', standStill);
	$(document).bind('keyup', 'r', restart);
	$(document).bind('keyup', '1 2 3 4 5 6 7 8 9', function(e) {
		if (gameOver)
			return;
		var key = jQuery.hotkeys.specialKeys[e.which];
		var x = 0, y = 0;
		if (key == 1) { x = -1; y = 1; }
		else if (key == 2) { x =  0; y =  1; }
		else if (key == 3) { x =  1; y =  1; }
		else if (key == 4) { x = -1; y =  0; }
		else if (key == 5) { x =  0; y =  0; }
		else if (key == 6) { x =  1; y =  0; }
		else if (key == 7) { x = -1; y = -1; }
		else if (key == 8) { x =  0; y = -1; }
		else if (key == 9) { x =  1; y = -1; }
		if (playerX + x > 0 && playerX + x <= cCells)
			playerX += x;
		if (playerY + y > 0 && playerY + y <= rCells)
			playerY += y;
		turn();
	});
	// Click to move.
	$('#game').mouseup(function(e) {
		if (gameOver)
			return;
		var coords = getCoords($(e.target).parent('td').andSelf().filter('td'));
		if (coords.x > playerX)
			playerX++;
		else if (coords.x < playerX)
			playerX--;
		if (coords.y > playerY)
			playerY++;
		else if (coords.y < playerY)
			playerY--;
		turn();
	});
	// Darken hint squares based on mouse movement.
	$('#game').mouseover(function(e) {
		if (gameOver)
			return;
		var coords = getCoords($(e.target).parent('td').andSelf().filter('td'));
		var x = playerX, y = playerY;
		if (coords.x > playerX)
			x++;
		else if (coords.x < playerX)
			x--;
		if (coords.y > playerY)
			y++;
		else if (coords.y < playerY)
			y--;
		$('.goDir').removeClass('goDir'); // reset previous dark square
		getTd(x, y).addClass('goDir');
	}).mouseleave(function(e) {
		$('.goDir').removeClass('goDir'); // reset dark square when the mouse leaves the grid
	});
	// Add entities to the grid.
	setupEntities();
	// Draw everything on the field.
	draw();
	// Retrieve high score.
	highScore = parseInt($.cookie('highscore')) || 0;
	$('#highscore').html(highScore);
});

// Returns true if this turn completed the level.
function turn() {
	// If the game is over, don't execute a turn.
	// This condition matches when a player wins a level by waiting.
	if (gameOver)
		return false;

	// Take action. Order of operations is important here:
	// - The player needs to pick up powerups before the enemies eat them.
	// - Enemies need to move before they eat powerups or collide with
	//   anything.
	// - Player-pile collision needs to be checked before enemies move because
	//   new piles will be created after enemies move and we want to check
	//   player-enemy collision instead of player-pile collision at those
	//   locations in order to correctly use the shield powerup.
	// - Similarly player-enemy collision needs to be checked before
	//   enemy-enemy collision because enemy-enemy collision will create piles.
	pickUpPowerups();								// Pick up powerups.
	var lost = false;
	if (checkPlayerPilesCollision()) {				// Check if the player ran into a pile.
		lost = true;
	}
	moveEnemies();									// Move the enemies.
	enemiesConsumePowerups();						// Check if the enemies ate any items.
	if (!lost && checkPlayerEnemiesCollision()) {	// Check if the player ran into enemies.
		if (shielded) {
			shielded = false;
			getPlayerImage();
		}
		else {
			lost = true;
		}
	}
	createPiles();									// Check if any enemies ran into piles or other enemies.

	// The player lost the game.
	// This has to come after the above section or else the high score will be wrong.
	if (lost)
		lose();
	// The player won the level.
	else if (enemies.length == 0) {
		// Update the indicator values.
		score += 5 + 5 * level; // score gets drawn in draw();
		setMessage('Level '+ level +' complete.', true);
		level++;
		$('#level').html(level);
		if (bombs < 5) bombs++;
		$('#bombs').html(bombs);
		if (safeTeleports < 3)
			safeTeleports += 1 + Math.floor(level / expandLevel) * (1 - (level % 2));
		$('#teleports').html(safeTeleports);
		
		// Update the action buttons.
		$('input[name=bomb]').attr('disabled', false);
		$('input[name=teleport]').addClass('safe').removeClass('unsafe');
		
		// Expand the number of cells if level > expandLevel
		if (level % expandLevel == 0) {
			expandGrid();
		}
		
		// Add entities to the grid.
		setupEntities();
		
		// Draw entities and indicators.
		draw();
		return true;
	}
	draw();
	return false;
}

function draw() {
	$('#game td').html(''); // Clear everything. Less efficient than clearing specific spaces; more efficient in terms of my time.
	$('#remaining').html(enemies.length);
	$('#score').html(score);
	getTd(playerX, playerY).html(playerIcon); // draw the player
	drawHints(); // draw the hints
	drawPowerups(); // draw the powerups
	drawEnemies(); // draw the enemies
	drawPiles(); // draw the piles
	if (gameOver) {
		getTd(playerX, playerY).addClass('dead');
	}
}

function getTd(x, y) {
	return $('#game tr.row-'+ y +' td.column-'+ x);
}

function expandGrid() {
	score += 250 * Math.floor(level / expandLevel);
	var cols = Math.floor(cCells * Math.sqrt(2)),
		rows = Math.floor(rCells * Math.sqrt(2));
	for (var i = cCells; i < cols; i++) {
		addColumn(i+1);
	}
	for (var i = rCells; i < rows; i++) {
		addRow(i+1);
	}
	cCells = cols;
	rCells = rows;
	draw();
}

function addRow(rowNum) {
	$('#game tr:last').clone().removeClass().addClass('row-'+ rowNum).appendTo('#game tbody:last');
}

function addColumn(colNum) {
	$('#game tr').append('<td class="column-'+ colNum +'"></td>');
}

function drawHints() {
	$('.hint').removeClass('hint ul um ur ml mm mr ll lm lr');
	var x = 0;
	for (var i = playerX - 1; i <= playerX + 1; i++) {
		for (var j = playerY - 1; j <= playerY + 1; j++) {
			if (i > 0 && i <= cCells && j > 0 && j <= rCells) { // inside the grid
				getTd(i, j).addClass('hint '+ directionalClasses[x]);
			}
			x++;
		}
	}
}

function getCoords($td) {
	return {
		'x': parseInt($td.attr('class').split('-').pop()),
		'y': parseInt($td.parent().attr('class').split('-').pop())
	};
}

function getRandBetween(lo, hi) {
	return parseInt(Math.floor(Math.random()*(hi-lo+1))+lo);
}

function checkPlayerEnemiesCollision() {
	var collision = false;
	for (var i = enemies.length-1; i >= 0; i--) {
		if (enemies[i].x == playerX && enemies[i].y == playerY) {
			// Kill enemies if the player is shielded.
			if (shielded) {
				collision = true;
				enemies.splice(i, 1);
				score++;
			}
			else
				return true;
		}
	}
	return collision;
}

function checkPlayerPilesCollision() {
	for (var i = 0; i < piles.length; i++) {
		if (piles[i].x == playerX && piles[i].y == playerY) {
			return true;
		}
	}
	return false;
}

function lose() {
	if (lives > 0) {
		lives--;
		$('#lives').html(lives);
		restartLevel();
		return;
	}
	
	gameOver = true;
	// Set the high score.
	if (score > highScore) {
		highScore = score;
		$.cookie('highscore', ''+ highScore, { expires: 4383 }); // 4383 == 12 years, in days
		$('#highscore').html(highScore);
		setMessage('Game over! New high score!', false);
	}
	else {
		setMessage('Game over!', false);
	}
}

function isPlayerLocationSafe() {
	var onPile = false;
	for (var i = 0; i < piles.length; i++) {
		if (piles[i].x == playerX && piles[i].y == playerY) {
			onPile = true;
			break;
		}
	}
	return !onPile && !isAnyNearPlayer(enemies);
}

function teleport() {
	if (gameOver)
		return;
	// Change clothing every time the player teleports. Hey, we're in an alternate reality.
	normalImagePath = getPlayerImage();
	// Generate random coordinates.
	playerX = getRandBetween(1, cCells);
	playerY = getRandBetween(1, rCells);
	// If unsafe, we're done.
	if (safeTeleports <= 0) {
		turn();
		return;
	}
	safeTeleports--;
	if (safeTeleports == 0) {
		$('input[name=teleport]').addClass('unsafe').removeClass('safe');
	}
	$('#teleports').html(safeTeleports);

	// Make sure the player doesn't spawn on top of enemies or piles.
	while (!isPlayerLocationSafe()) {
		playerX = getRandBetween(1, cCells);
		playerY = getRandBetween(1, rCells);
	}
	
	turn();
}

function bomb() {
	if (gameOver)
		return;
	// You can't use a bomb if you don't have any...
	if (bombs <= 0)
		return;
	// Use up a bomb.
	bombs--;
	if (bombs == 0)
		$('input[name=bomb]').attr('disabled', true);
	$('#bombs').html(bombs);
	// Destroy enemies.
	for (var i = enemies.length-1; i >= 0; i--) {
		if (isNearPlayer(enemies[i])) {
			piles.push(new pile(enemies[i].x, enemies[i].y));
			enemies.splice(i, 1);
			score++;
		}
	}
	// Destroy powerups.
	for (var i = powerups.length-1; i >= 0; i--) {
		if (isNearPlayer(powerups[i])) {
			powerups.splice(i, 1);
		}
	}
	
	turn();
}

function standStill() {
	if (gameOver)
		return;
	while (!isAnyNearPlayer(enemies) && !turn());
}

function restart() {
	// Warn the player that if the game isn't over they can't save their high score.
	if (!gameOver) {
		if (!confirm("Are you sure you want to restart? If you have a high score, it will not be saved.")) {
			return;
		}
	}
	
	// Remove indications that the player died.
	$('.dead').removeClass('dead');
	setMessage('', false);
	gameOver = false;
	
	// Reset the indicator values.
	score = 0; // draw() displays the score so we don't need to do it manually here
	shielded = false;
	getPlayerImage();
	bombs = 1;
	$('#bombs').html(bombs);
	safeTeleports = 1;
	$('#teleports').html(safeTeleports);
	lives = 0;
	$('#lives').html(lives);
	level = 1;
	$('#level').html(level);
	
	// Restore the action buttons to their original state.
	$('input[name=bomb]').attr('disabled', false);
	$('input[name=teleport]').addClass('safe').removeClass('unsafe');
	
	// Set the grid back to its original size.
	for (var i = cCells; i > origCols; i--) {
		$('#game td.column-'+ i).remove();
	}
	for (var i = rCells; i > origRows; i--) {
		$('#game tr.row-'+ i).remove();
	}
	cCells = origCols;
	rCells = origRows;
	
	// Set up the entities on the grid.
	setupEntities();

	// Display the entities on the grid.
	draw();
}

function restartLevel() {
	// Remove indications that the player died.
	getTd(playerX, playerY).removeClass('dead');
	gameOver = false;
	setMessage('You died and used an extra life. Level restarted.', true);

	// We're starting a level, so add items as appropriate.
	shielded = false;
	getPlayerImage();
	if (bombs < 5) bombs++;
	$('#bombs').html(bombs);
	if (safeTeleports < 3)
		safeTeleports += 1 + Math.floor(level / expandLevel) * (1 - (level % 2));
	$('#teleports').html(safeTeleports);
	
	// Update the action buttons.
	$('input[name=bomb]').attr('disabled', false);
	$('input[name=teleport]').addClass('safe').removeClass('unsafe');
	
	// Set up the entities on the grid.
	setupEntities();

	// Display the entities on the grid.
	draw();
}

function getPlayerImage() {
	playerIcon = '<img id="player" alt="Player" src="images/player-'+
		(shielded ? 'shielded' : getRandBetween(2, 8))
		+'.png" height="30" width="30" />';
}

function setupEntities() {
	piles = []; // piles
	// The collision detection expects that these are in order.
	playerX = parseInt(Math.round(cCells/2)); // player
	playerY = parseInt(Math.round(rCells/2));
	enemies = createEnemies(); // enemies
	powerups = createPowerups(); // powerups
	
	// Every once in awhile, collision detection fails. I can't figure out why
	// and it's extremely difficult to reproduce. But when it happens there is
	// the very nasty bug that an enemy or powerup ends up on top of the player
	// and that kind of ruins the trust you have in the game that the rules
	// will work as expected. So, let's do a sanity check here and make sure we
	// don't accidentally end up with an enemy or powerup in the wrong place.
	// TODO: Make this sanity check unnecessary.
	var x = Math.round(parseInt(cCells)/2), y = Math.round(parseInt(rCells)/2);
	for (var i = enemies.length-1; i >= 0; i--) {
		var e = enemies[i];
		if (Math.round(e.x) == x && Math.round(e.y) == y) {
			enemies.splice(i, 1); // just get rid of it.
			if (console && console.error && console.trace) {
				console.error("An enemy was placed on top of the player.", e);
				console.trace();
			}
		}
	}
	for (var i = powerups.length-1; i >= 0; i--) {
		var p = powerups[i];
		if (Math.round(p.x) == x && Math.round(p.y) == y) {
			powerups.splice(i, 1); // just get rid of it.
			if (console && console.error && console.trace) {
				console.error("A powerup was placed on top of the player.", p);
				console.trace();
			}
		}
	}
}

function setMessage(text, fade) {
	clearTimeout(messageFadeTimerA);
	clearTimeout(messageFadeTimerB);
	$('#messages').html(text).css('opacity', '1');
	if (fade) {
		// Fade out in 2 seconds after 5 seconds, then clear the text and set back to visible.
		messageFadeTimerA = setTimeout("$('#messages').animate({'opacity': '0'}, 2000);", 5000);
		messageFadeTimerB = setTimeout("$('#messages').html('').css('opacity', '1');", 7250);
	}
}

// Enemies --------------------------------------------------------------------

function enemy(x, y) {
	this.x = x;
	this.y = y;
}

function createEnemies() {
	var e = new Array();
	for (var i = 0; i < 4 + level * 4 + Math.floor(level / expandLevel); i++) {
		var a = new enemy(getRandBetween(1, cCells), getRandBetween(1, rCells));
		while (enemyLocationOccupied(a, e)) {
			a.x = getRandBetween(1, cCells);
			a.y = getRandBetween(1, rCells);
		}
		e[i] = a;
	}
	return e;
}

function enemyLocationOccupied(a, e) {
	if (a.x == playerX && a.y == playerY) {
		return true;
	}
	for (var i = 0; i < e.length; i++) {
		if (a.x == e[i].x && a.y == e[i].y) {
			return true;
		}
	}
	return false;
}

function drawEnemies() {
	for (var i = 0; i < enemies.length; i++) {
		getTd(enemies[i].x, enemies[i].y).html(enemyIcon);
	}
}

function moveEnemies() {
	for (var i = 0; i < enemies.length; i++) {
		var e = enemies[i];
		if (e.x < playerX)
			e.x++;
		else if (e.x > playerX)
			e.x--;
		if (e.y < playerY)
			e.y++;
		else if (e.y > playerY)
			e.y--;
	}
}

function isAnyNearPlayer(arr) {
	for (var i = 0; i < arr.length; i++) {
		if (isNearPlayer(arr[i])) {
			return true;
		}
	}
	return false;	
}

function isNearPlayer(e) {
	return e.x >= playerX-1 && e.x <= playerX+1 && e.y >= playerY-1 && e.y <= playerY+1;
}

function enemiesConsumePowerups() {
	for (var i = 0; i < enemies.length; i++) {
		var e = enemies[i];
		for (var j = powerups.length-1; j >= 0; j--) {
			var p = powerups[j];
			if (e.x == p.x && e.y == p.y) {
				powerups.splice(j, 1);
			}
		}
	}
}

// Piles ----------------------------------------------------------------------

function pile(x, y) {
	this.x = x;
	this.y = y;
}

function createPiles() {
	// Collisions with piles
	for (var i = enemies.length-1; i >= 0; i--) {
		var e = enemies[i];
		if (checkPileCollision(e)) {
			enemies.splice(i, 1);
			score++;
		}
	}
	// Collisions with other enemies
	es = enemies.slice(0); // copy the array
	for (var i = es.length-1; i >= 0; i--) {
		var e = es[i];
		for (var j = i-1; j >= 0; j--) {
			var f = es[j];
			if (e.x == f.x && e.y == f.y) { // if the enemies are in the same spot
				enemies.remove(e);
				enemies.remove(f);
				if (checkPileCollision(e)) {
					score++; // We're double-counting
				}
				else {
					score += 3; // 1 for each enemy and 1 for the pile
					piles.push(new pile(e.x, e.y));
				}
			}
		}
	}
}

function checkPileCollision(e) {
	for (var i = 0; i < piles.length; i++) {
		var p = piles[i];
		if (e.x == p.x && e.y == p.y) {
			return true;
		}
	}
	return false;
}

function drawPiles() {
	for (var i = 0; i < piles.length; i++) {
		getTd(piles[i].x, piles[i].y).html(pileIcon);
	}
}

Array.prototype.remove = function(item) {
	var i = $.inArray(item, this);
	if (i === undefined || i < 0) return undefined;
	return this.splice(i, 1);
};

// Powerups -------------------------------------------------------------------

function powerup(x, y, type) {
	this.x = x;
	this.y = y;
	this.type = type;
}

function createPowerups() {
	// Only add items in every other level.
	if (level % 2 == 0)
		return [];
	// Create as many items as the level requires.
	var p = new Array();
	for (var i = 0; i < 1 + (level * 0.125) * (level % 3) + (level / expandLevel) * 2; i++) {
		// Make sure items don't spawn in the same place as the player.
		var x, y;
		do {
			x = getRandBetween(1, cCells);
			y = getRandBetween(1, rCells);
		}
		while (x == playerX && y == playerY);

		// Make sure items don't spawn in the same place as another item.
		var collision = true;
		while (collision) {
			collision = false;
			for (var j = 0; j < powerups.length; j++) {
				if (x == powerups[j].x && y == powerups[j].y) {
					x = getRandBetween(1, cCells);
					y = getRandBetween(1, rCells);
					collision = true;
					break;
				}
			}
		}

		// Make sure items don't spawn in the same place as any enemies.
		collision = true;
		while (collision) {
			collision = false;
			for (var j = 0; j < enemies.length; j++) {
				if (x == enemies[j].x && y == enemies[j].y) {
					x = getRandBetween(1, cCells);
					y = getRandBetween(1, rCells);
					collision = true;
					break;
				}
			}
		}

		// If we have no collisions, add the item to our list.
		p[i] = new powerup(x, y, powerupTypes[getRandBetween(0, powerupTypes.length-1)]);
	}
	return p;
}

function drawPowerups() {
	for (var i = 0; i < powerups.length; i++) {
		getTd(powerups[i].x, powerups[i].y).html(getPowerupIcon(powerups[i].type));
	}
}

function getPowerupIcon(type) {
	return '<img class="powerup '+ type +'" alt="'+ type +'" src="images/'+ type +'.png" height="30" width="30" />';
}

function pickUpPowerups() {
	for (var i = powerups.length-1; i >= 0; i--) {
		var p = powerups[i];
		if (p.x == playerX && p.y == playerY) {
			addPowerup(p.type);
			powerups.splice(i, 1);
			break;
		}
	}
}

function addPowerup(type) {
	if (type == 'bomb') {
		bombs++;
		$('#bombs').html(bombs);
		$('input[name=bomb]').attr('disabled', false);
	}
	else if (type == 'life') {
		lives++;
		$('#lives').html(lives);
	}
	else if (type == 'shield') {
		shielded = true;
		getPlayerImage();
	}
	else if (type == 'teleporter-safe') {
		safeTeleports++;
		$('#teleports').html(safeTeleports);
		$('input[name=teleport]').addClass('safe').removeClass('unsafe');
	}
}

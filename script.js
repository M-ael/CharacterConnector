/* 
ToDo:
Move all selected nodes together when moving one.
Add ability to resize the textareas in the right sidebar.

Organize all the code better.

Add method to add image to node.
Add method to add custom connection colors.

Fix smooth hide button movement.
*/

// Globals
let nodes = [];
let connections = [];
let currentNode = null;
const sidebarDefaultWidth = 250;

// Variables for right-click dragging
let isRightClickDragging = false;
let deletedNodesDuringDrag = new Set();

// Variables for auto-opening sidebar
let autoOpenSidebar = true;

// Variables for creating connections
let isCreatingConnection = false;
let connectionStartNode = null;
let tempConnectionLine = null;

// Variables for selection
let isSelecting = false;
let selectionRect;
let selectionStartPoint = { x: 0, y: 0 };
let selectedNodes = new Set();
let copiedNodesData = null; // For copy/paste

// Initialize Konva Stage with separate layers
const stage = new Konva.Stage({
  container: 'canvas-container',
  width: window.innerWidth,
  height: window.innerHeight,
  draggable: true,
});

const gridLayer = new Konva.Layer();
const connectionsLayer = new Konva.Layer();
const mainLayer = new Konva.Layer();
stage.add(gridLayer);
stage.add(connectionsLayer);
stage.add(mainLayer);

const selectionLayer = new Konva.Layer();
stage.add(selectionLayer);

// Draw Gridlines on gridLayer
function drawGrid() {
  // Clear existing gridlines to prevent duplication
  gridLayer.destroyChildren();

  const gridSize = 50;
  const width = stage.width();
  const height = stage.height();

  // Get gridline color from CSS variable
  const rootStyles = getComputedStyle(document.body);
  const gridlineColor = rootStyles.getPropertyValue('--gridline-color').trim();

  for (let i = -width; i < width * 2; i += gridSize) {
    gridLayer.add(
      new Konva.Line({
        points: [i, -height, i, height * 2],
        stroke: gridlineColor,
        strokeWidth: 1,
      })
    );
  }

  for (let j = -height; j < height * 2; j += gridSize) {
    gridLayer.add(
      new Konva.Line({
        points: [-width, j, width * 2, j],
        stroke: gridlineColor,
        strokeWidth: 1,
      })
    );
  }

  // Re-add nodes after drawing grid
  nodes.forEach((node) => {
    mainLayer.add(node.group);
  });

  gridLayer.batchDraw();
  mainLayer.batchDraw();
}

// Disable right-click menu on canvas
document.getElementById('canvas-container').addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

stage.on('click', function (e) {
  // Add node on Ctrl-click in empty canvas space
  if (e.evt.ctrlKey && e.target === stage) {
    const pointerPosition = stage.getPointerPosition();
    const x = (pointerPosition.x - stage.x()) / stage.scaleX();
    const y = (pointerPosition.y - stage.y()) / stage.scaleY();
    addNode(x, y);
    // Save state
    saveCanvasState();
  }

  // Close all comment bubbles if the setting is active and clicked on empty canvas
  if (localStorage.getItem('closeObjectsOnCanvasClick') === 'true' && e.target === stage) {
    closeAllConnectionBubbles();
    // Deselect all selected objects
    clearSelection();
  }
});

// Event handlers for selection rectangle
stage.on('mousedown', function (e) {
  if (e.evt.shiftKey && e.evt.button === 0 && e.target === stage) {
    isSelecting = true;
    const pos = stage.getPointerPosition();
    selectionStartPoint = {
      x: (pos.x - stage.x()) / stage.scaleX(),
      y: (pos.y - stage.y()) / stage.scaleY(),
    };
    selectionRect = new Konva.Rect({
      x: selectionStartPoint.x,
      y: selectionStartPoint.y,
      width: 0,
      height: 0,
      fill: 'rgba(0, 123, 255, 0.3)',
      stroke: 'rgba(0, 123, 255, 0.8)',
      strokeWidth: 1,
    });
    selectionLayer.add(selectionRect);
    selectionLayer.batchDraw();
  }
});

stage.on('mousemove', function (e) {
  if (isSelecting) {
    const pos = stage.getPointerPosition();
    const currentPoint = {
      x: (pos.x - stage.x()) / stage.scaleX(),
      y: (pos.y - stage.y()) / stage.scaleY(),
    };

    const x = Math.min(selectionStartPoint.x, currentPoint.x);
    const y = Math.min(selectionStartPoint.y, currentPoint.y);
    const width = Math.abs(currentPoint.x - selectionStartPoint.x);
    const height = Math.abs(currentPoint.y - selectionStartPoint.y);

    selectionRect.setAttrs({
      x: x,
      y: y,
      width: width,
      height: height,
    });
    selectionLayer.batchDraw();
  }
});

stage.on('mouseup', function (e) {
  if (isSelecting) {
    isSelecting = false;

    // Get the selection rectangle's bounding box
    const selectionBox = selectionRect.getClientRect();

    // Remove the selection rectangle
    selectionRect.destroy();
    selectionLayer.batchDraw();

    // Clear previous selection
    clearSelection();

    // Find nodes within the selection rectangle
    nodes.forEach((nodeData) => {
      const nodeGroup = nodeData.group;
      const nodeRect = nodeGroup.getClientRect();

      if (Konva.Util.haveIntersection(selectionBox, nodeRect)) {
        selectedNodes.add(nodeGroup);
        selectNode(nodeGroup);
      } else {
        deselectNode(nodeGroup);
      }
    });
  }
});

// Add Node
function addNode(x, y, name = '', story = '', reference = '') {
  const group = new Konva.Group({
    x: x,
    y: y,
    draggable: true,
    name: name,
  });

  const text = new Konva.Text({
    text: name || 'Name',
    fontSize: 16,
    align: 'center',
    verticalAlign: 'middle',
    name: 'text',
    padding: 10,
    fill: '#fff', // Text color
  });

  // Get text size
  const textWidth = text.width();
  const textHeight = text.height();

  const rect = new Konva.Rect({
    width: textWidth,
    height: textHeight,
    fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: 0, y: textHeight },
    fillLinearGradientColorStops: [0, '#007bff', 1, '#0056b3'],
    cornerRadius: 10,
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowBlur: 10,
    shadowOffset: { x: 0, y: 4 },
    shadowOpacity: 0.6,
  });

  // Adjust text to rect size
  text.width(rect.width());
  text.height(rect.height());

  group.add(rect);
  group.add(text);
  mainLayer.add(group);
  mainLayer.draw();

  // Event listeners for nodes
  group.on('mousedown', (e) => {
    if (e.evt.ctrlKey) {
      group.draggable(false);
    }
  });

  group.on('mouseup', (e) => {
    group.draggable(true);
  });

  group.on('click', (e) => {
    if (e.evt.ctrlKey) {
      e.cancelBubble = true;
      handleCtrlClickOnNode(group);
    } else {
      if (isCreatingConnection) {
        e.cancelBubble = true;
        handleCtrlClickOnNode(group);
        return;
      }
      showNodeInfo(group);
      // Automatically open right sidebar if toggle is enabled
      if (autoOpenSidebar && isSidebarHidden('right-sidebar')) {
        toggleSidebar('right-sidebar');
      }
    }
  });

  group.on('dragmove', () => {
    updateConnectionsForNode(group);
  });

  group.on('dragend', () => {
    // Save state after dragging
    saveCanvasState();
  });

  group.selected = false;

  // Event listeners for nodes
  group.on('mouseover', () => {
    document.body.style.cursor = 'pointer';
    const rect = group.findOne('Rect');
    if (!group.selected) {
      rect.stroke('#0056b3'); // Hover color
      rect.strokeWidth(2);
      mainLayer.draw();
    }
  });

  group.on('mouseout', () => {
    document.body.style.cursor = 'default';
    const rect = group.findOne('Rect');
    if (!group.selected) {
      rect.stroke(null);
      mainLayer.draw();
    }
  });

  // Right-click to delete node
  group.on('contextmenu', (e) => {
    e.evt.preventDefault();
    deleteNode(group);
  });

  // Store in nodes array
  const nodeData = { group, name, story, reference };
  nodes.push(nodeData);
  updateNodeList();

  return nodeData;
}

function clearSelection() {
  selectedNodes.forEach((nodeGroup) => {
    deselectNode(nodeGroup);
  });
  selectedNodes.clear();
}

function selectNode(nodeGroup) {
  const rect = nodeGroup.findOne('Rect');
  rect.stroke('#FFFF00'); // Yellow stroke to indicate selection
  rect.strokeWidth(2);
  nodeGroup.selected = true;
  mainLayer.draw();
}

function deselectNode(nodeGroup) {
  const rect = nodeGroup.findOne('Rect');
  rect.stroke(null);
  rect.strokeWidth(0);
  nodeGroup.selected = false;
  mainLayer.draw();
}

// Delete Node
function deleteNode(group) {
  const nodeIndex = nodes.findIndex((n) => n.group === group);
  if (nodeIndex > -1) {
    // Remove node from selectedNodes
    if (selectedNodes.has(group)) {
      selectedNodes.delete(group);
    }

    // Remove node
    group.destroy();

    // Remove connections involving this node
    const connectionsToRemove = connections.filter(
      (c) => c.startNode === group || c.endNode === group
    );
    connectionsToRemove.forEach((c) => {
      deleteConnection(c, false); // false indicates we don't want to update connections between nodes here
    });

    nodes.splice(nodeIndex, 1);
    updateNodeList();
    mainLayer.draw();
    connectionsLayer.draw();
    gridLayer.batchDraw();
    // Clear right sidebar if the deleted node was selected
    if (currentNode && currentNode.group === group) {
      clearNodeInfo();
    }
    // Save state
    saveCanvasState();
  }
}

// Node List in Sidebar
function updateNodeList() {
  const nodeList = document.getElementById('node-list');
  nodeList.innerHTML = '';
  nodes.forEach((node) => {
    const li = document.createElement('li');
    li.textContent = node.name || 'Name';
    li.addEventListener('click', () => {
      stage.position({
        x: -node.group.x() * stage.scaleX() + stage.width() / 2 - node.group.width() / 2 * stage.scaleX(),
        y: -node.group.y() * stage.scaleY() + stage.height() / 2 - node.group.height() / 2 * stage.scaleY(),
      });
      stage.batchDraw();
      showNodeInfo(node.group);
      // Automatically open right sidebar if toggle is enabled
      if (autoOpenSidebar && isSidebarHidden('right-sidebar')) {
        toggleSidebar('right-sidebar');
      }
    });
    nodeList.appendChild(li);

    // Hover effect for sidebar nodes
    li.addEventListener('mouseover', () => {
      li.style.backgroundColor = 'var(--hover-background-color)';
    });
    li.addEventListener('mouseout', () => {
      li.style.backgroundColor = 'transparent';
    });
  });
}

// Show Node Info
function showNodeInfo(group) {
  currentNode = nodes.find((n) => n.group === group);
  const infoContent = document.getElementById('info-content');
  infoContent.innerHTML = `
    <input type="text" id="node-name" placeholder="Name" value="${currentNode.name}">
    <textarea id="node-story" placeholder="Story">${currentNode.story || ''}</textarea>
    <textarea id="node-reference" placeholder="Reference">${currentNode.reference || ''}</textarea>
  `;

  const nodeNameInput = document.getElementById('node-name');
  const nodeStoryInput = document.getElementById('node-story');
  const nodeReferenceInput = document.getElementById('node-reference');

  // Auto-save name on blur
  nodeNameInput.addEventListener('blur', () => {
    const newName = nodeNameInput.value.trim();
    if (newName !== currentNode.name) {
      // Check for name conflicts
      if (nodes.some((n) => n !== currentNode && n.name === newName)) {
        alert('A node with this name already exists.');
        nodeNameInput.value = currentNode.name;
        return;
      }
      currentNode.name = newName;
      const textNode = currentNode.group.findOne('.text');
      textNode.text(newName || 'Name');

      // Adjust rect size
      const rectNode = currentNode.group.findOne('Rect');
      textNode.width(null); // Reset width
      textNode.height(null); // Reset height
      textNode.setAttrs({ padding: 10 }); // Ensure padding is consistent
      const textWidth = textNode.width();
      const textHeight = textNode.height();
      rectNode.size({ width: textWidth, height: textHeight });
      textNode.width(rectNode.width());
      textNode.height(rectNode.height());

      updateNodeList();
      mainLayer.draw();
      gridLayer.batchDraw();

      // Update connections involving this node
      updateConnectionsForNode(currentNode.group);

      // Save state
      saveCanvasState();
    }
  });

  // Auto-save story on input
  nodeStoryInput.addEventListener('input', () => {
    currentNode.story = nodeStoryInput.value;
    // Save state
    saveCanvasState();
  });

  // Auto-save reference on input
  nodeReferenceInput.addEventListener('input', () => {
    currentNode.reference = nodeReferenceInput.value;
    // Save state
    saveCanvasState();
  });

  // Handle Escape key to exit text input
  const handleEscapeKey = (e) => {
    if (e.key === 'Escape') {
      e.target.blur();
    }
  };

  nodeNameInput.addEventListener('keydown', handleEscapeKey);
  nodeStoryInput.addEventListener('keydown', handleEscapeKey);
  nodeReferenceInput.addEventListener('keydown', handleEscapeKey);
}

// Clear Node Info
function clearNodeInfo() {
  currentNode = null;
  const infoContent = document.getElementById('info-content');
  infoContent.innerHTML = `<p>Select a node to view details.</p>`;
}

// Export Data
function exportCanvasData() {
  const data = {
    nodes: nodes.map((n) => ({
      x: n.group.x(),
      y: n.group.y(),
      name: n.name,
      story: n.story || '',
      reference: n.reference || '',
    })),
    connections: connections.map((c) => ({
      startNodeId: nodes.findIndex((n) => n.group === c.startNode),
      endNodeId: nodes.findIndex((n) => n.group === c.endNode),
      description: c.description || '',
      symbol: c.symbol || '',
    })),
  };
  const dataStr = JSON.stringify(data, null, 2);
  const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
  const link = document.createElement('a');
  link.setAttribute('href', dataUri);
  link.setAttribute('download', 'canvas-data.json');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Import Data
function importCanvasData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.nodes && Array.isArray(data.nodes) && data.connections && Array.isArray(data.connections)) {
        resetCanvasWithData(data);
      } else {
        alert('Invalid canvas data format.');
      }
    } catch (error) {
      alert('Error parsing JSON file: ' + error.message);
    }
  };
  reader.readAsText(file);
}

// Create a visual overlay for drag indication
const dragOverlay = document.createElement('div');
dragOverlay.style.position = 'fixed';
dragOverlay.style.top = 0;
dragOverlay.style.left = 0;
dragOverlay.style.width = '100%';
dragOverlay.style.height = '100%';
dragOverlay.style.border = '10px dashed rgba(0, 123, 255, 0.5)';
dragOverlay.style.backgroundColor = 'rgba(0, 123, 255, 0.1)';
dragOverlay.style.zIndex = '9999';
dragOverlay.style.display = 'none';
dragOverlay.style.pointerEvents = 'none'; // Prevent blocking mouse events
document.body.appendChild(dragOverlay);

// Handle dragover to allow drop and show visual indicator
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  dragOverlay.style.display = 'block'; // Show the visual overlay
});

// Handle dragleave to hide visual indicator
document.addEventListener('dragleave', (e) => {
  if (e.target === document || e.target === document.body) {
    dragOverlay.style.display = 'none';
  }
});

// Handle drop to process the file and reset visual indicator
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragOverlay.style.display = 'none'; // Hide the overlay

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      importCanvasData(file);
    } else {
      alert('Please drop a valid JSON file.');
    }
  }
});

// Reset Canvas with Data
function resetCanvasWithData(data) {
  nodes.forEach((n) => n.group.destroy());
  nodes = [];
  connections.forEach((c) => {
    if (c.line) c.line.destroy();
    if (c.symbolText) c.symbolText.destroy();
  });
  connections = [];

  data.nodes.forEach((n) => addNode(n.x, n.y, n.name, n.story, n.reference));

  if (data.connections) {
    data.connections.forEach((c) => {
      const startNode = nodes[c.startNodeId].group;
      const endNode = nodes[c.endNodeId].group;
      if (startNode && endNode) {
        createConnection(startNode, endNode, c.description, c.symbol);
      }
    });
  }

  updateNodeList();
  mainLayer.batchDraw();
  gridLayer.batchDraw();
  clearNodeInfo();
  // Save state
  saveCanvasState();
}

// Clear Canvas
function clearCanvas() {
  // Close any open connection bubbles
  closeAllConnectionBubbles(); 
  // run this before deleting connections and nodes, else it doesn't work because the connections to delete bubbles of don't exist

  // Clear all connections and their visual representation
  connections.forEach((c) => {
    if (c.line) c.line.destroy();
    if (c.symbolText) c.symbolText.destroy();
  });
  connections = [];

  // Clear all nodes and their visual representation
  nodes.forEach((n) => n.group.destroy());
  nodes = [];

  // Update the UI elements
  updateNodeList();
  mainLayer.draw();
  connectionsLayer.draw();
  gridLayer.batchDraw();

  // Clear the node info section
  clearNodeInfo();

  // Save the current state of the canvas
  saveCanvasState();
}

// Helper function to check if a sidebar is hidden
function isSidebarHidden(sidebarId) {
  const sidebarStateStr = localStorage.getItem('sidebarState');

  if (!sidebarStateStr) {
    // Initialize default state if not present
    const defaultState = {
      leftSidebarHidden: false,
      rightSidebarHidden: false,
      rightSidebarWidth: sidebarDefaultWidth,
    };
    localStorage.setItem('sidebarState', JSON.stringify(defaultState));
    return false; // Default visibility
  }

  try {
    const sidebarState = JSON.parse(sidebarStateStr);
    
    if (sidebarId === 'left-sidebar') {
      return sidebarState.leftSidebarHidden;
    } else if (sidebarId === 'right-sidebar') {
      return sidebarState.rightSidebarHidden;
    }
  } catch (error) {
    console.error('Error parsing sidebarState from localStorage:', error);
    return false; // Fallback to default
  }

  return null;
}

// Save Sidebar State
function saveSidebarState(leftSbarHidden, rightSbarHidden, rightSbarWidth) {
  const sidebarStateStr = localStorage.getItem('sidebarState');
  const sidebarState = JSON.parse(sidebarStateStr);
  let currentState = {};

  if (!sidebarStateStr) {
    currentState = {
      leftSidebarHidden: false,
      rightSidebarHidden: false,
      rightSidebarWidth: sidebarDefaultWidth,
    };
    localStorage.setItem('sidebarState', JSON.stringify(currentState));
    return;
  }

  // Prioritize function inputs
  currentState.leftSidebarHidden = leftSbarHidden;
  currentState.rightSidebarHidden = rightSbarHidden;
  currentState.rightSidebarWidth = rightSbarWidth;

  // If no inputs, use existing 
  if (currentState.leftSidebarHidden === undefined) currentState.leftSidebarHidden = sidebarState.leftSidebarHidden;
  if (currentState.rightSidebarHidden === undefined) currentState.rightSidebarHidden = sidebarState.rightSidebarHidden;
  if (currentState.rightSidebarWidth === undefined) currentState.rightSidebarWidth = sidebarState.rightSidebarWidth;

  localStorage.setItem('sidebarState', JSON.stringify(currentState));
}


// Set Sidebar State
function setSidebarState(sidebarId, isHidden, rightSbarWidth) {
  const sidebar = document.getElementById(sidebarId);
  const buttonId = sidebarId === 'left-sidebar' ? 'toggle-left-sidebar' : 'toggle-right-sidebar';
  const button = document.getElementById(buttonId);

  if (sidebarId === 'left-sidebar') {
    if (isHidden) {
      sidebar.style.transform = `translateX(-${sidebarDefaultWidth}px)`;
      button.textContent = '»';
      button.style.left = '0px';
      saveSidebarState(true, undefined, undefined);
    } else {
      sidebar.style.transform = 'translateX(0)';
      button.textContent = '«';
      button.style.left = (sidebarDefaultWidth + 20) + 'px';
      saveSidebarState(false, undefined, undefined);
    }
  } else if (sidebarId === 'right-sidebar') {
    let width;
    if (rightSbarWidth) {
      width = rightSbarWidth;
    } else {
      width = JSON.parse(localStorage.getItem('sidebarState')).rightSidebarWidth;
    }
    if (isHidden) {
      sidebar.style.transform = `translateX(${width}px)`;
      button.textContent = '«';
      button.style.right = '0px';
      saveSidebarState(undefined, true, width);
    } else {
      sidebar.style.transform = 'translateX(0)';
      button.textContent = '»';
      button.style.right = (width + 20) + 'px';
      sidebar.style.width = width + 'px';
      saveSidebarState(undefined, false, width);
    }
  }
}

// Toggle Sidebar Visibility
function toggleSidebar(sidebarId) {
  if (sidebarId === 'left-sidebar') {
    const isHidden = !isSidebarHidden(sidebarId);

    setSidebarState('left-sidebar', isHidden);
  } else if (sidebarId === 'right-sidebar') {
    const isHidden = !isSidebarHidden(sidebarId);

    setSidebarState('right-sidebar', isHidden);
  }
}

// Load Sidebar State
function loadSidebarState() {
  // Left Sidebar
  setSidebarState('left-sidebar', isSidebarHidden('left-sidebar'), undefined);

  // Right Sidebar
  setSidebarState('right-sidebar', isSidebarHidden('right-sidebar'), JSON.parse(localStorage.getItem('sidebarState')).rightSidebarWidth);
}

// Settings Modal Functionality
const openSettingsBtn = document.getElementById('open-settings');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.querySelector('.close-button');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const autoOpenSidebarToggle = document.getElementById('auto-open-sidebar-toggle');
const closeObjectsToggle = document.getElementById('close-objects-toggle');

openSettingsBtn.addEventListener('click', () => {
  settingsModal.style.display = 'block';
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.style.display = 'none';
});

// Close modal when clicking outside the modal content
window.addEventListener('click', (event) => {
  if (event.target === settingsModal) {
    settingsModal.style.display = 'none';
  }
});

// Dark Mode Toggle
darkModeToggle.addEventListener('change', () => {
  // Save dark mode state
  document.body.classList.toggle('dark-mode', darkModeToggle.checked);
  localStorage.setItem('darkMode', darkModeToggle.checked);

  // Redraw grid to update gridline color
  drawGrid();
  updateAllConnectionPositions();
});

// Auto-Open Sidebar Toggle
autoOpenSidebarToggle.addEventListener('change', () => {
  autoOpenSidebar = autoOpenSidebarToggle.checked;
  // Save auto-open sidebar state
  localStorage.setItem('autoOpenSidebar', autoOpenSidebar);
});

// Auto-Close all Bubbles Toggle
closeObjectsToggle.addEventListener('change', () => {
  localStorage.setItem('closeObjectsOnCanvasClick', closeObjectsToggle.checked);
});

// Load Dark Mode setting State
function loadDarkModeState() {
  const darkMode = localStorage.getItem('darkMode') === 'true';
  document.body.classList.toggle('dark-mode', darkMode);
  darkModeToggle.checked = darkMode;
}

// Load Auto-Open Sidebar Setting state
function loadAutoOpenSidebarState() {
  const autoOpen = localStorage.getItem('autoOpenSidebar');
  if (autoOpen !== null) {
    autoOpenSidebar = autoOpen === 'true';
    autoOpenSidebarToggle.checked = autoOpenSidebar;
  } else {
    // Default to true
    autoOpenSidebar = true;
    autoOpenSidebarToggle.checked = true;
    localStorage.setItem('autoOpenSidebar', 'true');
  }
}

// Load Close Bubbles Setting state 
function loadCloseObjectsState() {
  const closeObjectsState = localStorage.getItem('closeObjectsOnCanvasClick');
  const closeObjectsToggle = document.getElementById('close-objects-toggle');
  closeObjectsToggle.checked = closeObjectsState === 'true';
}

// Event Listeners for Sidebar Toggle Buttons
document.getElementById('toggle-left-sidebar').addEventListener('click', () => {
  toggleSidebar('left-sidebar');
});

document.getElementById('toggle-right-sidebar').addEventListener('click', () => {
  toggleSidebar('right-sidebar');
});

// Event Listeners for Add Node, Export, Import, and Reset
document.getElementById('add-node').addEventListener('click', () => {
  addNode(100, 100);
  // Save state
  saveCanvasState();
});
document.getElementById('export-data').addEventListener('click', exportCanvasData);
document.getElementById('import-data-button').addEventListener('click', () => {
  document.getElementById('import-data').click();
});
document.getElementById('import-data').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importCanvasData(file);
});
document.getElementById('clear-canvas').addEventListener('click', clearCanvas);

// Handle Window Resize
window.addEventListener('resize', () => {
  stage.width(window.innerWidth);
  stage.height(window.innerHeight);
  drawGrid();
});

// Zoom Functionality
function zoomStage(e) {
  e.evt.preventDefault();
  const oldScale = stage.scaleX();
  const pointer = stage.getPointerPosition();

  const mousePointTo = {
    x: (pointer.x - stage.x()) / oldScale,
    y: (pointer.y - stage.y()) / oldScale,
  };

  const scaleBy = 1.05;
  const direction = e.evt.deltaY > 0 ? -1 : 1;
  const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

  stage.scale({ x: newScale, y: newScale });

  const newPos = {
    x: pointer.x - mousePointTo.x * newScale,
    y: pointer.y - mousePointTo.y * newScale,
  };
  stage.position(newPos);
  stage.batchDraw();

  // Update any open bubbles
  updateOpenBubbles();

  // Save view state
  saveCanvasViewState();
}

stage.on('wheel', zoomStage);

// Auto-Save Canvas State to localStorage
function saveCanvasState() {
  const data = {
    nodes: nodes.map((n) => ({
      x: n.group.x(),
      y: n.group.y(),
      name: n.name,
      story: n.story || '',
      reference: n.reference || '',
    })),
    connections: connections.map((c) => ({
      startNodeId: nodes.findIndex((n) => n.group === c.startNode),
      endNodeId: nodes.findIndex((n) => n.group === c.endNode),
      description: c.description || '',
      symbol: c.symbol || '',
    })),
  };
  localStorage.setItem('canvasData', JSON.stringify(data));
}

// Load Canvas State from localStorage
function loadCanvasState() {
  const dataStr = localStorage.getItem('canvasData');
  if (dataStr) {
    const data = JSON.parse(dataStr);
    resetCanvasWithData(data);
  } else {
    // Initialize with empty canvas
    clearCanvas();
  }
}

// Auto-Save Canvas View State to localStorage
function saveCanvasViewState() {
  const viewState = {
    scale: stage.scaleX(), // Uniform scaling (scaleX === scaleY)
    position: stage.position(),
  };
  localStorage.setItem('canvasViewState', JSON.stringify(viewState));
}

// Load Canvas View State from localStorage
function loadCanvasViewState() {
  const viewStateStr = localStorage.getItem('canvasViewState');
  if (viewStateStr) {
    const viewState = JSON.parse(viewStateStr);
    stage.scale({ x: viewState.scale, y: viewState.scale });
    stage.position(viewState.position);
    stage.batchDraw();
  }
}

// Load all states on startup
function initialize() {
  // UI
  loadSidebarState();
  loadCanvasState();
  loadCanvasViewState();
  clearNodeInfo();
  
  // Settings
  loadDarkModeState();
  loadAutoOpenSidebarState();
  loadCloseObjectsState();

  drawGrid();
}

initialize();

// Resizing Right Sidebar
(function () {
  const resizer = document.getElementById('right-sidebar-resizer');
  const sidebar = document.getElementById('right-sidebar');
  let isResizing = false;

  resizer.addEventListener('mousedown', function (e) {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e) {
    if (!isResizing) return;
    const newWidth = window.innerWidth - e.clientX;
    setSidebarState('right-sidebar', undefined, newWidth);
  });

  document.addEventListener('mouseup', function (e) {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = 'default';
    }
  });
})();

// Right-Click Drag to Delete Multiple Nodes
document.getElementById('canvas-container').addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    isRightClickDragging = true;
    deletedNodesDuringDrag.clear();
  }
});

document.getElementById('canvas-container').addEventListener('mousemove', (e) => {
  if (isRightClickDragging) {
    const pos = stage.getPointerPosition();
    const shape = stage.getIntersection(pos);
    if (shape && shape.parent && !deletedNodesDuringDrag.has(shape.parent)) {
      deleteNode(shape.parent);
      deletedNodesDuringDrag.add(shape.parent);
    }
  }
});

document.getElementById('canvas-container').addEventListener('mouseup', (e) => {
  if (e.button === 2) {
    isRightClickDragging = false;
    deletedNodesDuringDrag.clear();
  }
});

// Handle Ctrl-Click on Node for Connection
function handleCtrlClickOnNode(group) {
  if (!isCreatingConnection) {
    // Start creating a connection
    isCreatingConnection = true;
    connectionStartNode = group;
    // Create a temporary line from the start node to the mouse position
    const startPos = getNodeCenterPosition(group);
    tempConnectionLine = new Konva.Line({
      points: [startPos.x, startPos.y, startPos.x, startPos.y],
      stroke: '#555',
      strokeWidth: 2,
      dash: [4, 4],
    });
    connectionsLayer.add(tempConnectionLine);
    connectionsLayer.draw();
    // Add mousemove listener to update temp line
    stage.on('mousemove', handleMouseMoveWhileCreatingConnection);
  } else {
    // Finish creating the connection
    if (group === connectionStartNode) {
      // Cannot connect node to itself
      cancelConnectionCreation();
      return;
    }
    // Check if max connections reached
    const existingConnections = getConnectionsBetweenNodes(connectionStartNode, group);
    if (existingConnections.length >= 3) {
      alert('Maximum of 3 connections between two nodes allowed.');
      cancelConnectionCreation();
      return;
    }
    createConnection(connectionStartNode, group);
    cancelConnectionCreation();
  }
}

// Handle mouse move while creating connection
function handleMouseMoveWhileCreatingConnection() {
  const pos = stage.getPointerPosition();
  const startPos = getNodeCenterPosition(connectionStartNode);
  const endPos = stage.getPointerPosition();
  endPos.x = (endPos.x - stage.x()) / stage.scaleX();
  endPos.y = (endPos.y - stage.y()) / stage.scaleY();
  tempConnectionLine.points([startPos.x, startPos.y, endPos.x, endPos.y]);
  connectionsLayer.batchDraw();
}

// Cancel connection creation
function cancelConnectionCreation() {
  if (tempConnectionLine) {
    tempConnectionLine.destroy();
    tempConnectionLine = null;
  }
  isCreatingConnection = false;
  connectionStartNode = null;
  stage.off('mousemove', handleMouseMoveWhileCreatingConnection);
}

// Get center position of a node
function getNodeCenterPosition(group) {
  const rect = group.findOne('Rect');
  const x = group.x() + rect.width() / 2;
  const y = group.y() + rect.height() / 2;
  return { x, y };
}

// Get binding points of a node
function getNodeBindingPoints(group) {
  const smallOffset = 5;
  const rect = group.findOne('Rect');
  const points = {
    left: {
      x: group.x() + smallOffset,
      y: group.y() + rect.height() / 2
    },
    center: {
      x: group.x() + rect.width() / 2,
      y: group.y() + rect.height() / 2
    },
    right: {
      x: group.x() + rect.width() - smallOffset,
      y: group.y() + rect.height() / 2
    }
  };
  return points;
}

// Create Connection
function createConnection(startNode, endNode, description = '', symbol = '') {
  // Create the connection object
  const connection = {
    startNode,
    endNode,
    line: null,
    description,
    symbol,
    symbolText: null,
    bubbleDiv: null,
    startBinding: null,
    endBinding: null
  };
  connections.push(connection);
  // Recompute binding points for all connections between these nodes
  updateConnectionsBetweenNodes(startNode, endNode);
  // Save state
  saveCanvasState();

  return connection;
}

// Get connections between two nodes
function getConnectionsBetweenNodes(node1, node2) {
  return connections.filter(c =>
    (c.startNode === node1 && c.endNode === node2) ||
    (c.startNode === node2 && c.endNode === node1)
  );
}

// Update connections between two nodes
function updateConnectionsBetweenNodes(node1, node2) {
  const nodeConnections = getConnectionsBetweenNodes(node1, node2);
  const numConnections = nodeConnections.length;
  const bindingOptions = [];

  if (numConnections === 1) {
    bindingOptions.push('center');
  } else if (numConnections === 2) {
    bindingOptions.push('left', 'right');
  } else if (numConnections === 3) {
    bindingOptions.push('left', 'center', 'right');
  }

  // Assign bindings to connections
  nodeConnections.forEach((connection, index) => {
    connection.startBinding = bindingOptions[index];
    connection.endBinding = bindingOptions[index];
  });

  // Update the positions of the connections
  nodeConnections.forEach(connection => {
    updateConnectionPositions(connection);
  });
}

// Update every connection
function updateAllConnectionPositions() {
  connections.forEach((connection) => { 
    updateConnectionPositions(connection);
  });
}

// Update positions of connections
function updateConnectionPositions(connection) {
  const startPoints = getNodeBindingPoints(connection.startNode);
  const endPoints = getNodeBindingPoints(connection.endNode);

  const startBindingPoint = startPoints[connection.startBinding];
  const endBindingPoint = endPoints[connection.endBinding];

  // Determine the stroke color based on dark mode
  const isDarkMode = localStorage.getItem('darkMode') === 'true';
  const strokeColor = isDarkMode ? '#fff' : '#000';
  const invertedStrokeColor = isDarkMode ? '#000' : '#fff';

  // If line does not exist, create it
  if (!connection.line) {
    connection.line = new Konva.Line({
      points: [startBindingPoint.x, startBindingPoint.y, endBindingPoint.x, endBindingPoint.y],
      stroke: strokeColor,
      strokeWidth: 4,
    });

    connectionsLayer.add(connection.line);

    // Add event listeners to the line
    connection.line.on('click', (e) => {
      // Check if the left mouse button was clicked
      if (e.evt.button === 0) {
        e.cancelBubble = true; // Prevent event bubbling
        showConnectionBubble(connection);
      }
    });
    connection.line.on('mouseover', () => {
      document.body.style.cursor = 'pointer';
      connection.line.strokeWidth(6);
      connectionsLayer.draw();
    });
    connection.line.on('mouseout', () => {
      document.body.style.cursor = 'default';
      connection.line.strokeWidth(4);
      connectionsLayer.draw();
    });
  } else {
    // Update line points and stroke color
    connection.line.points([startBindingPoint.x, startBindingPoint.y, endBindingPoint.x, endBindingPoint.y]);
    connection.line.stroke(strokeColor); // Update stroke color
  }

  // Update symbol position
  const midPoint = {
    x: (startBindingPoint.x + endBindingPoint.x) / 2,
    y: (startBindingPoint.y + endBindingPoint.y) / 2,
  };

  const smallCenteringYOffset = 1;
  if (connection.symbol) {
    if (!connection.symbolText) {
      // Create symbol
      const symbolGroup = new Konva.Group({
        x: midPoint.x,
        y: midPoint.y,
      });

      const circle = new Konva.Circle({
        radius: 10,
        fill: invertedStrokeColor,
        stroke: strokeColor,
        strokeWidth: 1,
      });

      const text = new Konva.Text({
        text: connection.symbol.charAt(0),
        fontSize: 12,
        fill: strokeColor,
        align: 'center',
        verticalAlign: 'middle',
      });

      // Center the text in the circle
      text.offsetX(text.width() / 2);
      text.offsetY(text.height() / 2 - smallCenteringYOffset);

      symbolGroup.add(circle);
      symbolGroup.add(text);

      connectionsLayer.add(symbolGroup);
      connection.symbolText = symbolGroup;
    } else {
      // Update position
      connection.symbolText.position(midPoint);

      // Update circle and text colors
      const circle = connection.symbolText.findOne('Circle');
      const text = connection.symbolText.findOne('Text');
      circle.fill(invertedStrokeColor);
      circle.stroke(strokeColor);
      text.fill(strokeColor);

      // Update text
      text.text(connection.symbol.charAt(0));
      text.offsetX(text.width() / 2);
      text.offsetY(text.height() / 2 - smallCenteringYOffset);
    }
  } else {
    if (connection.symbolText) {
      connection.symbolText.destroy();
      connection.symbolText = null;
    }
  }

  connectionsLayer.batchDraw();
}

// Update connections when node moves
function updateConnectionsForNode(group) {
  connections.forEach((connection) => {
    if (connection.startNode === group || connection.endNode === group) {
      updateConnectionPositions(connection);
    }
  });
}

// Delete Connection
function deleteConnection(connection, update = true) {
  if (connection.line) {
    connection.line.destroy();
  }
  if (connection.symbolText) {
    connection.symbolText.destroy();
  }
  if (connection.bubbleDiv) {
    document.body.removeChild(connection.bubbleDiv);
    connection.bubbleDiv = null;
  }
  const index = connections.indexOf(connection);
  if (index > -1) {
    connections.splice(index, 1);
  }
  connectionsLayer.draw();

  // Recompute binding points for remaining connections between the nodes
  if (update) {
    updateConnectionsBetweenNodes(connection.startNode, connection.endNode);
  }

  saveCanvasState();
}

// Helper function to convert stage coordinates to page coordinates
function stageToPageCoordinates(pos) {
  const transform = stage.getAbsoluteTransform();
  const absolutePos = transform.point(pos);
  const containerRect = stage.container().getBoundingClientRect();
  return {
    x: absolutePos.x + containerRect.left,
    y: absolutePos.y + containerRect.top,
  };
}

// Close a specific connection bubble
function closeConnectionBubble(connection) {
  if (connection.bubbleDiv) {
    // Remove the bubble div from the DOM
    document.body.removeChild(connection.bubbleDiv);
    connection.bubbleDiv = null;

    // Remove event listeners
    connection.startNode.off('dragmove', connection.updateBubblePosition);
    connection.endNode.off('dragmove', connection.updateBubblePosition);
  }
}

// Close all open connection bubbles
function closeAllConnectionBubbles() {
  connections.forEach((connection) => {
    if (connection.bubbleDiv) {
      closeConnectionBubble(connection); // Reuse the specific close function
    }
  });
}

// Show Connection Bubble
function showConnectionBubble(connection) {
  // Close the bubble for this connection if already open
  closeConnectionBubble(connection);

  // Create the bubble div
  const bubbleDiv = document.createElement('div');
  bubbleDiv.classList.add('connection-bubble');

  // Store bubbleDiv in connection
  connection.bubbleDiv = bubbleDiv;

  // Create the input fields
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = connection.symbol || '';
  nameInput.placeholder = 'Symbol';

  const descriptionInput = document.createElement('textarea');
  descriptionInput.value = connection.description || '';
  descriptionInput.placeholder = 'Description';

  // Delete button
  const deleteButton = document.createElement('button');
  deleteButton.textContent = '❌';

  // Header row
  const headerDiv = document.createElement('div');
  headerDiv.style.display = 'flex';
  headerDiv.style.justifyContent = 'space-between';
  headerDiv.appendChild(nameInput);
  headerDiv.appendChild(deleteButton);

  bubbleDiv.appendChild(headerDiv);
  bubbleDiv.appendChild(descriptionInput);

  document.body.appendChild(bubbleDiv);

  // Function to update bubble position and scale
  connection.updateBubblePosition = function () {
    const linePoints = connection.line.points();
    const startPoint = { x: linePoints[0], y: linePoints[1] };
    const endPoint = { x: linePoints[2], y: linePoints[3] };
    const midPoint = {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2,
    };
    const absolutePosition = stageToPageCoordinates(midPoint);
    const scale = stage.scaleX()/1.5; // Uniform scaling

    // Get bubble height dynamically
    const bubbleHeight = (bubbleDiv.offsetHeight + 32) * scale;

    bubbleDiv.style.left = absolutePosition.x + 'px';
    bubbleDiv.style.top = absolutePosition.y - bubbleHeight / 2 + 'px'; // Adjusting y position
    bubbleDiv.style.transform = `translate(-50%, -50%) scale(${scale})`;
    bubbleDiv.style.transformOrigin = 'center center';
  };

  // Initial position update
  connection.updateBubblePosition();

  // Update position when nodes are moved
  connection.startNode.on('dragmove', connection.updateBubblePosition);
  connection.endNode.on('dragmove', connection.updateBubblePosition);

  // Event listeners
  nameInput.addEventListener('input', () => {
    connection.symbol = nameInput.value;
    updateConnectionPositions(connection);
    saveCanvasState();
  });

  descriptionInput.addEventListener('input', () => {
    connection.description = descriptionInput.value;
    saveCanvasState();
  });

  deleteButton.addEventListener('click', () => {
    deleteConnection(connection);
    closeConnectionBubble(connection);
  });

  // Stop click events from propagating
  bubbleDiv.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  window.addEventListener('keydown', escapeListener);
}


// Function to update all open bubbles
function updateOpenBubbles() {
  connections.forEach((connection) => {
    if (connection.bubbleDiv && connection.updateBubblePosition) {
      connection.updateBubblePosition();
    }
  });
}

// Update bubbles when stage is panned
stage.on('dragmove', () => {
  updateOpenBubbles();
  saveCanvasViewState();
});

function deleteSelectedNodes() {
  selectedNodes.forEach((nodeGroup) => {
    deleteNode(nodeGroup);
  });
  selectedNodes.clear();
}

function selectAllNodes() {
  clearSelection(); // Clear previous selection
  nodes.forEach((nodeData) => {
    const nodeGroup = nodeData.group;
    selectedNodes.add(nodeGroup);
    selectNode(nodeGroup);
  });
}

function copySelectedNodes() {
  if (selectedNodes.size === 0) return;

  copiedNodesData = {
    nodes: [],
    connections: [],
  };

  const selectedNodeDataList = [];
  selectedNodes.forEach((nodeGroup) => {
    const nodeData = nodes.find((n) => n.group === nodeGroup);
    if (nodeData) {
      selectedNodeDataList.push(nodeData);
    }
  });

  // Compute the top-left corner of selected nodes to use as origin
  let minX = Infinity;
  let minY = Infinity;
  selectedNodeDataList.forEach((nodeData) => {
    const x = nodeData.group.x();
    const y = nodeData.group.y();
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  });

  // Store nodes data relative to minX and minY
  selectedNodeDataList.forEach((nodeData) => {
    copiedNodesData.nodes.push({
      x: nodeData.group.x() - minX,
      y: nodeData.group.y() - minY,
      name: nodeData.name,
      story: nodeData.story,
      reference: nodeData.reference,
    });
  });

  // Store connections between selected nodes
  connections.forEach((connection) => {
    if (selectedNodes.has(connection.startNode) && selectedNodes.has(connection.endNode)) {
      // Find indexes of startNode and endNode in copiedNodesData.nodes
      const startNodeIndex = selectedNodeDataList.findIndex((n) => n.group === connection.startNode);
      const endNodeIndex = selectedNodeDataList.findIndex((n) => n.group === connection.endNode);
      if (startNodeIndex !== -1 && endNodeIndex !== -1) {
        copiedNodesData.connections.push({
          startNodeId: startNodeIndex,
          endNodeId: endNodeIndex,
          description: connection.description,
          symbol: connection.symbol,
        });
      }
    }
  });
}

function pasteCopiedNodes() {
  if (!copiedNodesData || copiedNodesData.nodes.length === 0) return;

  // Get mouse position relative to the canvas
  const pointerPosition = stage.getPointerPosition();
  const mouseX = (pointerPosition.x - stage.x()) / stage.scaleX();
  const mouseY = (pointerPosition.y - stage.y()) / stage.scaleY();

  // Compute the offset between the copied data origin and the mouse position
  let minX = Infinity;
  let minY = Infinity;
  copiedNodesData.nodes.forEach((node) => {
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
  });

  const offsetX = mouseX - minX;
  const offsetY = mouseY - minY;

  // Create a mapping from old node index to new node group
  const newNodes = [];
  copiedNodesData.nodes.forEach((node) => {
    const nodeData = addNode(node.x + offsetX, node.y + offsetY, node.name, node.story, node.reference);
    newNodes.push(nodeData);
  });

  // Create new connections
  copiedNodesData.connections.forEach((conn) => {
    const startNode = newNodes[conn.startNodeId].group;
    const endNode = newNodes[conn.endNodeId].group;
    if (startNode && endNode) {
      createConnection(startNode, endNode, conn.description, conn.symbol);
    }
  });

  // Update node list and draw
  updateNodeList();
  mainLayer.batchDraw();
  connectionsLayer.batchDraw();
  gridLayer.batchDraw();

  // Clear previous selection
  clearSelection();

  // Select newly pasted nodes
  newNodes.forEach((nodeData) => {
    selectedNodes.add(nodeData.group);
    selectNode(nodeData.group);
  });

  // Save state
  saveCanvasState();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close all open bubbles
    closeAllConnectionBubbles();

    // Deselect all objects
    clearSelection();

    // Close settings menu
    if (settingsModal.style.display === 'block') {
      settingsModal.style.display = 'none';
    }
  }

  if (e.key === 'Shift') {
    // Shift disables dragging
    stage.draggable(false);
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    // Delete selected nodes
    deleteSelectedNodes();
  }

  if (e.ctrlKey && e.key === 'a') {
    // Ctrl+A to select all nodes
    e.preventDefault();
    selectAllNodes();
  }

  if (e.ctrlKey && e.key === 'c') {
    // Ctrl+C to copy selected nodes
    e.preventDefault();
    copySelectedNodes();
  }

  if (e.ctrlKey && e.key === 'v') {
    // Ctrl+V to paste copied nodes
    e.preventDefault();
    pasteCopiedNodes();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') {
    stage.draggable(true);
  }
});

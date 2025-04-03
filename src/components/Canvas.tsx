"use client";
import { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import { io } from "socket.io-client";

// Initialize socket connection
const socket = io("http://localhost:5000");

const DrawingBoard = ({
  userId = `user-${Math.floor(Math.random() * 1000)}`,
  boardId = "board-1",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const historyRef = useRef<fabric.Object[][]>([]);
  const historyIndexRef = useRef(-1);

  // Drawing state
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(3);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<string[]>([]);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    // Create Fabric.js canvas
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 500,
    });

    // Explicitly set drawing mode and brush
    canvas.isDrawingMode = true;
    // Make sure the pencil brush is used (most reliable)
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.width = brushSize;
    canvas.freeDrawingBrush.color = brushColor;

    fabricRef.current = canvas;

    // Join the board
    socket.emit("join_board", userId, boardId);
    setIsConnected(true);

    // Handle user joining
    socket.on("user_joined", (newUserId) => {
      if (newUserId !== userId) {
        setConnectedUsers((prev) => [...prev, newUserId]);
      }
    });

    // Add drawing event listeners
    canvas.on("path:created", (event: any) => {
      console.log("sent data to other users", event.path.toJSON());

      // Ensure path is properly serializable
      const pathJson = event.path.toJSON();

      // Send drawing data to server
      socket.emit("draw", boardId, pathJson);

      // Add to history for undo/redo
      addToHistory([...canvas.getObjects()]);
    });

    // Handle drawing from other users
    socket.on("draw", (pathData) => {
      console.log("Received drawing data", pathData);

      try {
        // Use proper Fabric.js methods to recreate the path
        // fabric.util.enlivenObjects([pathData], (objects) => {
        //   const path = objects[0];
        //   canvas.add(path);
        //   canvas.renderAll();
        // });
        const path = new fabric.Path(pathData.path, {
          left: pathData.left,
          top: pathData.top,
          stroke: pathData.stroke,
          strokeWidth: pathData.strokeWidth,
          fill: pathData.fill || "",
          strokeLineJoin: pathData.strokeLineJoin,
          strokeLineCap: pathData.strokeLineCap,
          selectable: false,
        });
      } catch (error) {
        console.error("Error processing drawing data:", error);
      }
    });

    // Handle eraser
    socket.on("erase", (eraseData) => {
      const objects = canvas.getObjects();
      for (let i = 0; i < objects.length; i++) {
        if (
          objects[i].top === eraseData.top &&
          objects[i].left === eraseData.left
        ) {
          canvas.remove(objects[i]);
          break;
        }
      }
      canvas.renderAll();
    });

    // Handle undo
    socket.on("undo", () => {
      if (historyIndexRef.current > 0) {
        historyIndexRef.current--;
        canvas.clear();

        const objects = historyRef.current[historyIndexRef.current] || [];
        objects.forEach((obj) => {
          canvas.add(obj);
        });

        canvas.renderAll();
      }
    });

    // Handle redo
    socket.on("redo", () => {
      if (historyIndexRef.current < historyRef.current.length - 1) {
        historyIndexRef.current++;
        canvas.clear();

        const objects = historyRef.current[historyIndexRef.current] || [];
        objects.forEach((obj) => {
          canvas.add(obj);
        });

        canvas.renderAll();
      }
    });

    // Cursor movement for collaborative awareness
    canvas.on("mouse:move", (event) => {
      const pointer = canvas.getPointer(event.e);
      socket.emit("cursor_move", boardId, {
        userId,
        x: pointer.x,
        y: pointer.y,
      });
    });

    // Cleanup on unmount
    return () => {
      canvas.dispose();
      socket.off("draw");
      socket.off("erase");
      socket.off("undo");
      socket.off("redo");
      socket.off("user_joined");
    };
  }, []);

  // Update brush settings when they change
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    if (tool === "brush") {
      canvas.isDrawingMode = true;

      // Ensure we have a pencil brush
      if (
        !canvas.freeDrawingBrush ||
        !(canvas.freeDrawingBrush instanceof fabric.PencilBrush)
      ) {
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      }

      canvas.freeDrawingBrush.width = brushSize;
      canvas.freeDrawingBrush.color = brushColor;

      // Remove eraser handler
      canvas.off("mouse:down", handleEraser);
    } else if (tool === "eraser") {
      // Set up eraser functionality
      canvas.isDrawingMode = false;

      // Add click handler for erasing
      canvas.on("mouse:down", handleEraser);
    }
  }, [tool, brushColor, brushSize]);

  // Eraser handler
  const handleEraser = (options: any) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const pointer = canvas.getPointer(options.e);
    const objects = canvas.getObjects();

    // Find object under pointer
    for (let i = objects.length - 1; i >= 0; i--) {
      if (objects[i].containsPoint(pointer)) {
        const objectData = {
          top: objects[i].top,
          left: objects[i].left,
        };

        canvas.remove(objects[i]);
        socket.emit("erase", boardId, objectData);
        addToHistory([...canvas.getObjects()]);
        canvas.renderAll();
        break;
      }
    }
  };

  // Add to history for undo/redo
  const addToHistory = (objects: fabric.Object[]) => {
    // If we're not at the end of history, truncate
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(
        0,
        historyIndexRef.current + 1
      );
    }

    // Add current state to history
    historyRef.current.push(objects);
    historyIndexRef.current = historyRef.current.length - 1;
  };

  // Undo handler
  const handleUndo = () => {
    socket.emit("undo", boardId);
  };

  // Redo handler
  const handleRedo = () => {
    socket.emit("redo", boardId);
  };

  // Clear canvas
  const handleClear = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.clear();
    historyRef.current = [[]];
    historyIndexRef.current = 0;
    addToHistory([]);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex gap-2">
          <button
            className={`px-4 py-2 rounded ${
              tool === "brush" ? "bg-blue-500 text-white" : "bg-gray-200"
            }`}
            onClick={() => setTool("brush")}
          >
            Brush
          </button>
          <button
            className={`px-4 py-2 rounded ${
              tool === "eraser" ? "bg-blue-500 text-white" : "bg-gray-200"
            }`}
            onClick={() => setTool("eraser")}
          >
            Eraser
          </button>
        </div>

        {tool === "brush" && (
          <div className="flex items-center gap-2">
            <label htmlFor="color-picker">Color:</label>
            <input
              type="color"
              id="color-picker"
              value={brushColor}
              onChange={(e) => setBrushColor(e.target.value)}
              className="w-8 h-8 cursor-pointer"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <label htmlFor="size-slider">Size:</label>
          <input
            type="range"
            id="size-slider"
            min="1"
            max="20"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            className="w-24"
          />
          <span>{brushSize}px</span>
        </div>

        <div className="flex gap-2">
          <button
            className="px-4 py-2 bg-gray-200 rounded"
            onClick={handleUndo}
          >
            Undo
          </button>
          <button
            className="px-4 py-2 bg-gray-200 rounded"
            onClick={handleRedo}
          >
            Redo
          </button>
          <button
            className="px-4 py-2 bg-red-500 text-white rounded"
            onClick={handleClear}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
        <canvas ref={canvasRef} width={800} height={500} />
      </div>

      <div className="text-sm text-gray-500">
        {isConnected ? (
          <span>
            Connected as: {userId} | Board: {boardId} | Users online:{" "}
            {connectedUsers.length + 1}
          </span>
        ) : (
          <span>Connecting...</span>
        )}
      </div>
    </div>
  );
};

export default DrawingBoard;

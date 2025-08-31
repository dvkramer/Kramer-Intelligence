# Kramer Intelligence for Windows

This is the official Windows desktop application for Kramer Intelligence.

The application is a simple, lightweight wrapper for the official web application, available at [https://kramerintel.vercel.app/](https://kramerintel.vercel.app/). It provides a native, fullscreen experience for interacting with the AI assistant.

## Download (For Users)

You can download the latest installer from the [Releases](../../releases) page.

## For Developers

To build the application from source, you'll need to have Node.js and npm installed on your machine.

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/dvkramer/Kramer-Intelligence.git
    ```

2.  **Navigate to the project directory:**

    ```bash
    cd Kramer-Intelligence
    ```

3.  **Install dependencies:**

    This command installs Electron, Electron Builder, and other required packages.
    ```bash
    npm install
    ```

4.  **Run the application in development mode:**

    This will launch the application on your desktop.
    ```bash
    npm start
    ```

5.  **Build the application:**

    This command packages the application into a distributable format (e.g., a portable `.exe`), which will be located in the `dist/` directory.
    ```bash
    npm run dist
    ```

## Contributing

Contributions are always welcome. Feel free to create issues, pull requests, etc.

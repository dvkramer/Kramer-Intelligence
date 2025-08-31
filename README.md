# Kramer Intelligence for Windows

This is the official Windows desktop application for Kramer Intelligence.

The application is a simple Webview2 wrapper for the official web application, available at [https://kramerintel.vercel.app/](https://kramerintel.vercel.app/).

## Download (For Users)

You can download the latest installer from the [Releases](../../releases) page.

## For Developers

To build the application from source, you will need to set up your environment for Tauri development.

1.  **Install Prerequisites:**

    First, ensure you have installed all the necessary prerequisites for your operating system by following the official Tauri guide:
    [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites/)

2.  **Clone the repository:**

    ```bash
    git clone https://github.com/dvkramer/Kramer-Intelligence --branch windows-app
    ```

3.  **Navigate to the project directory:**

    ```bash
    cd Kramer-Intelligence
    ```

4.  **Install dependencies:**

    This command installs the Tauri CLI, which is the main tool for developing and bundling Tauri applications.
    ```bash
    npm install
    ```

5.  **Run the application in development mode:**

    This will launch the application with hot-reloading enabled.
    ```bash
    npm start
    ```

6.  **Build the application:**

    This command bundles the application into a native installer for your platform (e.g., an NSIS installer on Windows). The output will be located in the `src-tauri/target/release/bundle/` directory.
    ```bash
    npm run dist
    ```

## Contributing

Contributions are always welcome. Feel free to create issues, pull requests, etc.

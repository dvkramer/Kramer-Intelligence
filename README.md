# Gemini Fullstack LangGraph Quickstart

This project demonstrates a fullstack application using a React frontend and a LangGraph-powered backend agent. The agent is designed to perform comprehensive research on a user's query by dynamically generating search terms, querying the web using Google Search, reflecting on the results to identify knowledge gaps, and iteratively refining its search until it can provide a well-supported answer with citations. This application serves as an example of building research-augmented conversational AI using LangGraph and Google's Gemini models.

<img src="./app.png" title="Gemini Fullstack LangGraph" alt="Gemini Fullstack LangGraph" width="90%">

## Features

- 💬 Fullstack application with a React frontend and LangGraph backend.
- 🧠 Powered by a LangGraph agent for advanced research and conversational AI.
- 🔍 Dynamic search query generation using Google Gemini models.
- 🌐 Integrated web research via Google Search API.
- 🤔 Reflective reasoning to identify knowledge gaps and refine searches.
- 📄 Generates answers with citations from gathered sources.
- 🔄 Hot-reloading for both frontend and backend during development.

## Project Structure

The project is divided into two main directories:

-   `frontend/`: Contains the React application built with Vite.
-   `backend/`: Contains the LangGraph/FastAPI application, including the research agent logic.

## Getting Started: Local Development (Vercel CLI)

While the primary goal is Vercel deployment, you can also test the application locally using the Vercel CLI.

**1. Prerequisites:**

*   Node.js and npm (or yarn/pnpm)
*   Python 3.11+
*   [Vercel CLI](https://vercel.com/docs/cli): Install it with `npm install -g vercel`.
*   **`GEMINI_API_KEY`**:
    1.  Create a file named `.env` in the project root. Vercel CLI will automatically load this for local development.
    2.  Add your Gemini API key: `GEMINI_API_KEY="YOUR_ACTUAL_API_KEY"`
    3.  (Optional) Add any other environment variables you wish to test locally (e.g., `ANSWER_MODEL="gemini-1.5-pro-preview-0514"`).

**2. Install Dependencies:**

**Backend:** (Vercel CLI will use `backend/api/requirements.txt`)
```text
Note: For backend dependencies, Vercel CLI (vercel dev) will handle installation based on backend/api/requirements.txt.
If you want to run Python scripts directly from the backend or use an IDE with Python integration,
you should set up a virtual environment and install dependencies:
  python -m venv .venv
  source .venv/bin/activate  # On Windows: .venv\Scripts\activate
  pip install -r backend/api/requirements.txt
```

**Frontend:**
```bash
cd frontend
npm install
cd ..
```

**3. Run Development Server using Vercel CLI:**

From the project root directory:
```bash
vercel dev
```
This command will start a local development server that mimics the Vercel environment. It will build the frontend and run the Python serverless function from `backend/api/index.py`. Your application should be accessible at a local URL provided by the Vercel CLI (usually `http://localhost:3000`). The API endpoint will be available at `/api/agent`.

## How the Backend Agent Works (High-Level)

The core of the backend is a LangGraph agent defined in `backend/src/agent/graph.py`. It follows these steps:

<img src="./agent.png" title="Agent Flow" alt="Agent Flow" width="50%">

1.  **Generate Initial Queries:** Based on your input, it generates a set of initial search queries using a Gemini model.
2.  **Web Research:** For each query, it uses the Gemini model with the Google Search API to find relevant web pages.
3.  **Reflection & Knowledge Gap Analysis:** The agent analyzes the search results to determine if the information is sufficient or if there are knowledge gaps. It uses a Gemini model for this reflection process.
4.  **Iterative Refinement:** If gaps are found or the information is insufficient, it generates follow-up queries and repeats the web research and reflection steps (up to a configured maximum number of loops).
5.  **Finalize Answer:** Once the research is deemed sufficient, the agent synthesizes the gathered information into a coherent answer, including citations from the web sources, using a Gemini model.

## CLI Example

For quick one-off questions you can execute the agent from the command line. The
script `backend/examples/cli_research.py` runs the LangGraph agent and prints the
final answer:

```bash
cd backend
python examples/cli_research.py "What are the latest trends in renewable energy?"
```

## Deploying to Vercel (Simplified Setup)

This project has been streamlined for easy deployment to [Vercel's](https://vercel.com) free tier. The Vercel deployment will use a serverless function for the backend, and Vercel will handle building and serving the frontend.

**Prerequisites:**

*   A [Vercel account](https://vercel.com/signup).
*   [Git](https://git-scm.com/downloads) installed on your local machine.

**Deployment Steps:**

1.  **Fork this Repository:**
    *   Fork this GitHub repository to your own GitHub account.

2.  **Clone Your Forked Repository:**
    ```bash
    git clone https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY_NAME.git
    cd YOUR_REPOSITORY_NAME
    ```

3.  **Link to Vercel:**
    *   Go to your Vercel dashboard and click on "Add New... > Project".
    *   Import your forked Git repository. Vercel should automatically detect that it's a Vite frontend and will use the `vercel.json` configuration for the Python backend.

4.  **Configure Environment Variables:**
    *   In your Vercel project settings, navigate to "Settings" > "Environment Variables".
    *   Add the following environment variable:
        *   `GEMINI_API_KEY`: Your Google Gemini API key. This is required for the backend agent to function.

    *   **Optional Environment Variables:** The agent uses several models and parameters that can be configured via environment variables (see `backend/src/agent/configuration.py` for all options). You can override defaults by setting these in Vercel. Key ones include:
        *   `QUERY_GENERATOR_MODEL`: Model for generating search queries.
        *   `REFLECTION_MODEL`: Model for reflection.
        *   `ANSWER_MODEL`: Model for generating the final answer.
        *   `NUMBER_OF_INITIAL_QUERIES`: Default number of initial queries.
        *   `MAX_RESEARCH_LOOPS`: Default maximum research loops.
        *   `TAVILY_API_KEY` or `SERPAPI_API_KEY`: If you prefer to use Tavily or SerpAPI for web searches. Note: The current code primarily uses Google Search via Gemini. To enable other search providers, modifications to `backend/src/agent/tools_and_schemas.py` would be needed.

5.  **Deploy:**
    *   Vercel will automatically build and deploy your project when you push changes to your repository's main branch, or when you first import the project.
    *   Once deployed, Vercel will provide you with a URL to access your application (e.g., `your-project-name.vercel.app`).

Your application should now be running on Vercel! The frontend will make requests to the serverless backend, which securely uses your Gemini API key.

## Technologies Used

- [React](https://reactjs.org/) (with [Vite](https://vitejs.dev/)) - For the frontend user interface.
- [Tailwind CSS](https://tailwindcss.com/) - For styling.
- [Shadcn UI](https://ui.shadcn.com/) - For components.
- [LangGraph](https://github.com/langchain-ai/langgraph) - For building the backend research agent.
- [Google Gemini](https://ai.google.dev/models/gemini) - LLM for query generation, reflection, and answer synthesis.

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

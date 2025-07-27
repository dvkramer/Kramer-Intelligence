import customtkinter
import requests
import threading
from tkinter import filedialog
import os
import base64
from PIL import Image

customtkinter.set_appearance_mode("dark")
customtkinter.set_default_color_theme("blue")

class App(customtkinter.CTk):
    def __init__(self):
        super().__init__()

        self.title("Kramer Intelligence")
        self.geometry("800x600")

        self.grid_rowconfigure(1, weight=1)
        self.grid_columnconfigure(0, weight=1)

        # Header
        self.header = customtkinter.CTkFrame(self, height=50)
        self.header.grid(row=0, column=0, sticky="ew")
        self.header_label = customtkinter.CTkLabel(self.header, text="Kramer Intelligence", font=("Roboto", 20))
        self.header_label.pack(pady=10)

        # Chat history
        self.chat_history = customtkinter.CTkScrollableFrame(self)
        self.chat_history.grid(row=1, column=0, sticky="nsew", padx=10, pady=10)

        # Input frame
        self.input_frame = customtkinter.CTkFrame(self, height=100)
        self.input_frame.grid(row=2, column=0, sticky="ew", padx=10, pady=10)
        self.input_frame.grid_columnconfigure(1, weight=1)

        # File preview
        self.file_preview_frame = customtkinter.CTkFrame(self.input_frame, height=60)
        self.file_preview_frame.grid(row=0, column=0, columnspan=3, sticky="ew", pady=5)
        self.file_preview_frame.grid_remove() # Hide by default

        # Message input
        self.message_input = customtkinter.CTkTextbox(self.input_frame, height=40)
        self.message_input.grid(row=1, column=1, sticky="ew", padx=5)

        # Attach button
        self.attach_button = customtkinter.CTkButton(self.input_frame, text="📎", width=40, command=self.attach_file)
        self.attach_button.grid(row=1, column=0, sticky="w", padx=5)

        # Send button
        self.send_button = customtkinter.CTkButton(self.input_frame, text="Send", width=80, command=self.send_message)
        self.send_button.grid(row=1, column=2, sticky="e", padx=5)

        self.message_input.bind("<Return>", self.send_message)

        self.conversation_history = []
        self.selected_file = None
        self.selected_file_type = None
        self.selected_file_base64 = None

    def attach_file(self):
        filepath = filedialog.askopenfilename(
            filetypes=[
                ("Image files", "*.png;*.jpg;*.jpeg;*.webp;*.heic;*.heif"),
                ("PDF files", "*.pdf"),
            ]
        )
        if filepath:
            self.process_selected_file(filepath)

    def process_selected_file(self, filepath):
        self.selected_file = filepath
        filename = os.path.basename(filepath)
        file_ext = os.path.splitext(filename)[1].lower()

        if file_ext in [".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"]:
            self.selected_file_type = "image"
            self.show_image_preview(filepath)
        elif file_ext == ".pdf":
            self.selected_file_type = "pdf"
            self.show_pdf_preview(filename)

        with open(filepath, "rb") as f:
            self.selected_file_base64 = base64.b64encode(f.read()).decode("utf-8")

    def show_image_preview(self, filepath):
        self.clear_file_preview()
        img = Image.open(filepath)
        img.thumbnail((50, 50))
        self.preview_image = customtkinter.CTkImage(light_image=img, dark_image=img, size=(50, 50))
        preview_label = customtkinter.CTkLabel(self.file_preview_frame, image=self.preview_image, text="")
        preview_label.pack(side="left", padx=10)
        self.show_file_preview_frame()

    def show_pdf_preview(self, filename):
        self.clear_file_preview()
        preview_label = customtkinter.CTkLabel(self.file_preview_frame, text=f"PDF: {filename}")
        preview_label.pack(side="left", padx=10)
        self.show_file_preview_frame()

    def show_file_preview_frame(self):
        self.file_preview_frame.grid()
        remove_button = customtkinter.CTkButton(self.file_preview_frame, text="X", width=30, command=self.remove_file)
        remove_button.pack(side="right", padx=10)

    def remove_file(self):
        self.selected_file = None
        self.selected_file_type = None
        self.selected_file_base64 = None
        self.clear_file_preview()
        self.file_preview_frame.grid_remove()

    def clear_file_preview(self):
        for widget in self.file_preview_frame.winfo_children():
            widget.destroy()

    def send_message(self, event=None):
        message = self.message_input.get("1.0", "end-1c").strip()
        if message or self.selected_file:
            parts = []
            if self.selected_file:
                file_info = {
                    "inlineData": {
                        "mimeType": f"{self.selected_file_type}/{os.path.splitext(self.selected_file)[1][1:]}",
                        "data": self.selected_file_base64,
                    }
                }
                parts.append(file_info)
                self.display_message("user", f"Sent {self.selected_file_type}: {os.path.basename(self.selected_file)}")
                self.remove_file()

            if message:
                parts.append({"text": message})
                self.display_message("user", message)
                self.message_input.delete("1.0", "end")

            self.conversation_history.append({"role": "user", "parts": parts, "id": self.generate_message_id()})
            self.send_to_api()

    def send_to_api(self):
        self.show_loading()
        threading.Thread(target=self._send_to_api).start()

    def _send_to_api(self):
        try:
            payload = {"history": self.conversation_history}
            response = requests.post("https://kramerintel.vercel.app/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()
            ai_response = data["text"]
            self.conversation_history.append({"role": "model", "parts": [{"text": ai_response}], "id": self.generate_message_id()})
            self.display_message("ai", ai_response, message_id=self.conversation_history[-1]["id"])
        except requests.exceptions.RequestException as e:
            self.display_error(f"API Error: {e}")
        finally:
            self.hide_loading()

    def display_message(self, role, message, message_id=None):
        message_frame = customtkinter.CTkFrame(self.chat_history)
        message_frame.pack(anchor="w" if role == "ai" else "e", pady=5, padx=10, fill="x")

        label = customtkinter.CTkLabel(message_frame, text=message, wraplength=600, justify="left")
        label.pack(side="left", pady=5, padx=10)

        if role == "user":
            edit_button = customtkinter.CTkButton(message_frame, text="✏️", width=30, command=lambda: self.edit_message(message_id))
            edit_button.pack(side="right", padx=5)
        elif role == "ai":
            regenerate_button = customtkinter.CTkButton(message_frame, text="↺", width=30, command=lambda: self.regenerate_response(message_id))
            regenerate_button.pack(side="right", padx=5)

    def edit_message(self, message_id):
        # Find the message to edit
        message_to_edit = next((msg for msg in self.conversation_history if msg.get("id") == message_id), None)
        if not message_to_edit:
            return

        # Create a new window for editing
        edit_window = customtkinter.CTkToplevel(self)
        edit_window.title("Edit Message")
        edit_window.geometry("400x200")

        edit_textbox = customtkinter.CTkTextbox(edit_window, height=100)
        edit_textbox.pack(pady=10, padx=10, fill="both", expand=True)
        edit_textbox.insert("1.0", message_to_edit["parts"][0]["text"])

        def save_edit():
            new_text = edit_textbox.get("1.0", "end-1c").strip()
            message_to_edit["parts"][0]["text"] = new_text
            self.refresh_chat_history()
            edit_window.destroy()
            self.send_to_api()

        save_button = customtkinter.CTkButton(edit_window, text="Save", command=save_edit)
        save_button.pack(pady=10)

    def regenerate_response(self, message_id):
        # Find the index of the message to regenerate
        message_index = next((i for i, msg in enumerate(self.conversation_history) if msg.get("id") == message_id), None)
        if message_index is None:
            return

        # Remove the message and all subsequent messages
        self.conversation_history = self.conversation_history[:message_index]
        self.refresh_chat_history()
        self.send_to_api()


    def refresh_chat_history(self):
        for widget in self.chat_history.winfo_children():
            widget.destroy()
        for message in self.conversation_history:
            role = message["role"]
            text = ""
            for part in message["parts"]:
                if "text" in part:
                    text += part["text"]
                elif "inlineData" in part:
                    text += f"Sent {part['inlineData']['mimeType'].split('/')[0]}"
            self.display_message(role, text, message.get("id"))

    def generate_message_id(self):
        return os.urandom(16).hex()

    def show_loading(self):
        self.loading_label = customtkinter.CTkLabel(self, text="Thinking...")
        self.loading_label.place(relx=0.5, rely=0.5, anchor="center")

    def hide_loading(self):
        if hasattr(self, "loading_label"):
            self.loading_label.destroy()

    def display_error(self, message):
        error_label = customtkinter.CTkLabel(self, text=message, text_color="red")
        error_label.place(relx=0.5, rely=0.5, anchor="center")

if __name__ == "__main__":
    app = App()
    app.mainloop()

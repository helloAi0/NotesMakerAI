#include <drogon/drogon.h>

int main() {
    // Set Log Level
    drogon::app().setLogLevel(trantor::Logger::kInfo);

    // Load configuration or listen on port 8080
    drogon::app().addListener("0.0.0.0", 8080);

    // Register a health check endpoint
    drogon::app().registerHandler(
        "/api/health",
        [](const drogon::HttpRequestPtr &req,
           std::function<void (const drogon::HttpResponsePtr &)> &&callback) {
            Json::Value json;
            json["status"] = "healthy";
            json["service"] = "Notes Maker AI C++ Backend (Drogon)";
            json["version"] = "1.0.0";
            auto resp = drogon::HttpResponse::newHttpJsonResponse(json);
            callback(resp);
        },
        {drogon::Get}
    );

    // Register a notes listing API endpoint
    drogon::app().registerHandler(
        "/api/notes",
        [](const drogon::HttpRequestPtr &req,
           std::function<void (const drogon::HttpResponsePtr &)> &&callback) {
            Json::Value json;
            Json::Value note1;
            note1["id"] = 1;
            note1["title"] = "Quantum Mechanics Basics";
            note1["subject"] = "Physics";
            note1["content"] = "Introduction to wave functions and superposition states.";
            
            json.append(note1);
            auto resp = drogon::HttpResponse::newHttpJsonResponse(json);
            callback(resp);
        },
        {drogon::Get}
    );

    LOG_INFO << "Notes Maker AI C++ Backend starting on http://0.0.0.0:8080";
    drogon::app().run();
    return 0;
}
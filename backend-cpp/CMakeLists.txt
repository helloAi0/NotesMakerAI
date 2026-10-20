cmake_minimum_required(VERSION 3.10)
project(NotesMakerAIBackend CXX)

set(CMAKE_CXX_STANDARD 17)

# Find Drogon and dependencies
find_package(Drogon CONFIG REQUIRED)

include_directories(${CMAKE_CURRENT_SOURCE_DIR})

aux_source_directory(. SRC_LIST)

add_executable(NotesMakerAIBackend ${SRC_LIST})
target_link_libraries(NotesMakerAIBackend PRIVATE Drogon::Drogon)
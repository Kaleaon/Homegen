cmake_minimum_required(VERSION 3.22.1)
project("spatial_core")

add_library(
    spatial_core
    SHARED
    spatial_core.cpp
)

find_library(
    log-lib
    log
)

target_link_libraries(
    spatial_core
    ${log-lib}
)

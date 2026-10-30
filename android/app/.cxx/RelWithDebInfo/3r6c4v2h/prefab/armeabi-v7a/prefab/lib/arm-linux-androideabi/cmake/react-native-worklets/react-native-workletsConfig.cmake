if(NOT TARGET react-native-worklets::worklets)
add_library(react-native-worklets::worklets SHARED IMPORTED)
set_target_properties(react-native-worklets::worklets PROPERTIES
    IMPORTED_LOCATION "/Users/jimmy/Downloads/projects/personal/Standup-Companion/node_modules/react-native-worklets/android/build/intermediates/cxx/RelWithDebInfo/2r1y1d3e/obj/armeabi-v7a/libworklets.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/jimmy/Downloads/projects/personal/Standup-Companion/node_modules/react-native-worklets/android/build/prefab-headers/worklets"
    INTERFACE_LINK_LIBRARIES ""
)
endif()


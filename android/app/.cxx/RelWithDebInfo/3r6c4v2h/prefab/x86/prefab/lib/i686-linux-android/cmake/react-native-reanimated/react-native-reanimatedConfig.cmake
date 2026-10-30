if(NOT TARGET react-native-reanimated::reanimated)
add_library(react-native-reanimated::reanimated SHARED IMPORTED)
set_target_properties(react-native-reanimated::reanimated PROPERTIES
    IMPORTED_LOCATION "/Users/jimmy/Downloads/projects/personal/Standup-Companion/node_modules/react-native-reanimated/android/build/intermediates/cxx/RelWithDebInfo/22233e72/obj/x86/libreanimated.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/jimmy/Downloads/projects/personal/Standup-Companion/node_modules/react-native-reanimated/android/build/prefab-headers/reanimated"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

